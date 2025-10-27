const pty = require('node-pty');
const os = require('os');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { BrowserWindow, ipcMain, clipboard } = require('electron');
const tmp = require('tmp');
const chokidar = require('chokidar');

// --- GUI Window Management ---
let guiWindow = null;

function ensureGuiWindow() {
    if (guiWindow && !guiWindow.isDestroyed()) {
        guiWindow.focus();
        return;
    }

    guiWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'VCP PowerShell Executor',
        frame: false, // 禁用窗口边框
        titleBarStyle: 'hidden', // 隐藏标题栏
        webPreferences: {
            preload: path.join(__dirname, 'gui', 'preload.js'),
            nodeIntegration: false, // 禁用 Node.js 集成以增强安全性
            contextIsolation: true, // 启用上下文隔离
            spellcheck: false,
            // 将 node_modules 的路径作为参数传递给窗口，以便在 HTML 中使用
            additionalArguments: [`--node-modules-path=${path.join(__dirname, '..', '..', '..', '..', 'node_modules')}`]
        },
        autoHideMenuBar: true,
    });

    guiWindow.loadFile(path.join(__dirname, 'gui', 'PowerShellViewer.html'));

    guiWindow.on('closed', () => {
        guiWindow = null;
        // 当GUI关闭时，也终止关联的 pty 进程
        if (ptyProcess) {
            try {
                ptyProcess.kill();
                console.log('[PowerShellExecutor] GUI closed, associated pty process terminated.');
            } catch (e) {
                console.error('[PowerShellExecutor] Error terminating pty process on GUI close:', e);
            }
            // ptyProcess 的 onExit 事件处理器会自动将其设置为 null 并从 childProcesses 集合中移除
        }
    });
}

// --- 主题管理与文件监视 ---
const settingsPath = path.join(__dirname, '..', '..', '..', 'AppData', 'settings.json');
let settingsWatcher = null;
let lastSentTheme = null; // 用于存储上一次发送的主题名称

/**
 * 读取、比较并发送主题更新。
 * 只有当主题名称实际发生变化时，才会向GUI发送事件。
 * @param {Electron.WebContents} targetWebContents - 目标窗口的 webContents。
 * @param {boolean} [forceSend=false] - 是否强制发送，即使用于初始化。
 */
function sendThemeUpdate(targetWebContents, forceSend = false) {
    if (!targetWebContents || targetWebContents.isDestroyed()) {
        return;
    }
    try {
        let currentTheme = 'dark'; // 默认主题
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            currentTheme = settings.currentThemeMode || 'dark';
        }

        // 只有当主题变化或强制发送时，才进行通信
        if (currentTheme !== lastSentTheme || forceSend) {
            targetWebContents.send('theme-init', { themeName: currentTheme });
            lastSentTheme = currentTheme; // 更新已发送的主题记录
            console.log(`[PowerShellExecutor] Theme updated to: ${currentTheme}`);
        }
    } catch (error) {
        console.error('[PowerShellExecutor] Error reading or sending theme settings:', error);
    }
}

// 初始化文件监视器
function setupThemeWatcher() {
    if (settingsWatcher) {
        settingsWatcher.close();
    }
    settingsWatcher = chokidar.watch(settingsPath, {
        persistent: true,
        ignoreInitial: true
    });

    settingsWatcher.on('change', () => {
        if (guiWindow && !guiWindow.isDestroyed()) {
            sendThemeUpdate(guiWindow.webContents);
        }
    });
}

// 在插件加载时启动监视
setupThemeWatcher();


// 监听来自GUI的“就绪”信号
ipcMain.on('powershell-gui-ready', (event) => {
    // 当GUI准备好时，发送初始主题
    // 强制发送初始主题
    sendThemeUpdate(event.sender, true);
});

// 监听来自GUI的用户命令
ipcMain.on('powershell-command', (event, command) => {
    if (ptyProcess && command) {
        // 将用户输入的命令写入 pty 进程
        ptyProcess.write(`${command}\r`);
    }
});

// 监听来自GUI的复制请求
ipcMain.on('copy-to-clipboard', (event, text) => {
    if (text) {
        clipboard.writeText(text);
    }
});

// 监听来自GUI的尺寸调整请求
ipcMain.on('powershell-resize', (event, { cols, rows }) => {
    if (ptyProcess) {
        try {
            ptyProcess.resize(cols, rows);
        } catch (e) {
            console.error('[PowerShellExecutor] Failed to resize pty:', e);
        }
    }
});

// --- 新增：窗口控制事件监听 ---
ipcMain.on('minimize-window', () => {
    if (guiWindow) guiWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (guiWindow) {
        if (guiWindow.isMaximized()) {
            guiWindow.unmaximize();
        } else {
            guiWindow.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    if (guiWindow) guiWindow.close();
});

// --- ANSI Escape Code Stripper ---
/**
 * 从字符串中移除 ANSI 转义序列（用于控制颜色的代码）。
 * @param {string} str - 可能包含 ANSI 代码的输入字符串。
 * @returns {string} - 清理后的纯文本字符串。
 */
function stripAnsi(str) {
    // 正则表达式用于匹配并移除 ANSI 转义码
    return str.replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        ''
    );
}


// --- 模块级状态 ---
// 用于保存持久化的伪终端（PowerShell）进程
let ptyProcess = null;
// 移除 fullTerminalHistory，后端不再维护终端内容的完整状态
// 新增：用于跟踪所有子进程，确保它们在插件卸载或程序退出时被正确清理
const childProcesses = new Set();
let guiDataListener = null; // 新增：保存GUI监听器的引用
let isExecutingCommand = false; // 新增：执行命令状态标志

// --- 配置加载 ---
// 插件启动时，从 config.env 文件读取默认配置
const defaultConfig = {
    returnMode: 'delta' // 默认为增量模式
};

try {
    const configPath = path.join(__dirname, 'config.env');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const match = configContent.match(/^POWERSHELL_RETURN_MODE\s*=\s*(delta|full)/m);
        if (match) {
            defaultConfig.returnMode = match[1];
        }
    }
} catch (error) {
    console.error('[PowerShellExecutor] Error reading config.env:', error);
}


/**
 * 启动一个独立的 Python GUI 脚本来请求管理员权限并执行命令。
 * 这是一个“即发即忘”的操作，它会打开一个全新的、独立的管理员终端窗口。
 * @param {string} command - 需要以管理员权限执行的命令。
 * @returns {Promise<string>} - 一个解析为提示信息的消息。
 */
function executeAdminCommand(command) {
    return new Promise((resolve, reject) => {
        // 1. 创建一个临时的输出文件
        tmp.file({ postfix: '.txt' }, (err, tmpFilePath, fd, cleanupCallback) => {
            if (err) {
                return reject(new Error(`无法创建临时文件: ${err.message}`));
            }

            const pythonConfirmScript = path.join(__dirname, 'AdminConfirm.py');
            const commandAsBase64 = Buffer.from(command).toString('base64');

            // 2. 准备传递给Python脚本的参数
            const scriptPathForPS = pythonConfirmScript.replace(/'/g, "''");
            const commandForPS = commandAsBase64.replace(/'/g, "''");
            const tmpPathForPS = tmpFilePath.replace(/'/g, "''");
            const argumentList = `"${scriptPathForPS}", "${commandForPS}", "${tmpPathForPS}"`;

            // 3. 构造PowerShell命令以管理员权限运行Python脚本
            const psCommand = `Start-Process -FilePath "pythonw.exe" -ArgumentList ${argumentList} -Verb RunAs -Wait`;

            const child = spawn('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-Command', psCommand
            ], {
                windowsHide: true
            });
            childProcesses.add(child); // 跟踪进程

            let stderrOutput = '';
            child.stderr.on('data', (data) => {
                stderrOutput += data.toString('utf-8');
            });
            
            child.on('error', (err) => {
                childProcesses.delete(child); // 停止跟踪
                cleanupCallback(); // 清理临时文件
                reject(new Error(`无法启动PowerShell包装脚本: ${err.message}`));
            });

            child.on('close', (code) => {
                childProcesses.delete(child); // 停止跟踪
                // PowerShell脚本执行完毕，现在我们可以安全地读取临时文件的内容了。
                fs.readFile(tmpFilePath, 'utf-8', (readErr, data) => {
                    cleanupCallback(); // 确保无论如何都清理临时文件

                    if (readErr) {
                        // 如果读取文件失败，但我们从stderr得到了信息，就用它。
                        if (stderrOutput.trim()) {
                            return reject(new Error(`管理员脚本执行失败: ${stderrOutput.trim()}`));
                        }
                        return reject(new Error(`无法读取管理员任务的输出文件: ${readErr.message}`));
                    }

                    const result = data.trim();
                    if (result === "USER_CANCELLED") {
                        resolve("用户取消了管理员权限请求。");
                    } else if (result.startsWith("ERROR:")) {
                        reject(new Error(result.substring(6).trim()));
                    } else {
                        resolve(result);
                    }
                });
            });
        });
    });
}

/**
 * 创建一个新的伪终端 (pty) 进程。
 */
function createNewPtySession() {
    // 如果已存在旧进程，先销毁它
    if (ptyProcess) {
        childProcesses.delete(ptyProcess);
        ptyProcess.kill();
        // 当重置会话时，通知前端清屏
        if (guiWindow && !guiWindow.isDestroyed()) {
            guiWindow.webContents.send('powershell-clear');
        }
    }
 
    let shell = 'bash';
    let args = [];
 
    if (os.platform() === 'win32') {
        // 优先使用 PowerShell Core (pwsh.exe)，如果不存在则回退到 Windows PowerShell (powershell.exe)
        const pwshPath = path.join(process.env.PROGRAMFILES, 'PowerShell', '7', 'pwsh.exe');
        if (fs.existsSync(pwshPath)) {
            shell = pwshPath;
        } else {
            shell = 'powershell.exe';
        }
        args = ['-NoLogo'];
    }
 
    ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-color',
        cwd: process.env.USERPROFILE || process.env.HOME,
        env: process.env
    });
    childProcesses.add(ptyProcess);
    
    // 设置 PowerShell 输出为 UTF-8 编码
    ptyProcess.write('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r');

    // 创建GUI数据监听器（带执行状态检查）
    guiDataListener = (data) => {
        // 关键修复：执行命令期间不向GUI发送数据
        if (isExecutingCommand) {
            return;
        }
        
        if (guiWindow && !guiWindow.isDestroyed()) {
            const dataStr = data.toString('utf-8');
            if (dataStr) {
                guiWindow.webContents.send('powershell-data', dataStr);
            }
        }
    };

    // 设置数据监听器，将所有 pty 输出直接代理到 GUI
    ptyProcess.onData(guiDataListener);

    // 当 pty 进程意外退出时，清理资源
    ptyProcess.onExit(() => {
        childProcesses.delete(ptyProcess);
        ptyProcess = null;
        guiDataListener = null;
        isExecutingCommand = false;
    });
}

/**
 * 插件的主入口点，由 PluginManager 直接调用。
 * @param {object} args - 从 AI 工具调用中解析出的参数。
 * @returns {Promise<string>} - 命令执行的结果。
 */
/**
 * 在给定的 pty 会话中执行单条命令并返回其增量输出。
 * @param {object} ptyProcess - node-pty 实例。
 * @param {string} singleCommand - 要执行的单条命令。
 * @returns {Promise<string>} - 该命令的增量输出。
 */
function executeSingleCommandInPty(ptyProcess, singleCommand) {
    return new Promise((resolve, reject) => {
        if (!ptyProcess) {
            return reject(new Error("PTY process is not available."));
        }

        let commandOutput = '';
        const boundary = `--- VCP_COMMAND_BOUNDARY_${crypto.randomUUID()} ---`;

        const dataListener = (data) => {
            const dataStr = data.toString('utf-8');

            // 检查数据是否包含边界
            if (dataStr.includes(boundary)) {
                clearTimeout(timeoutId);
                ptyProcess.removeListener('data', dataListener);

                // 提取边界之前最后的有效数据
                const finalChunk = dataStr.substring(0, dataStr.indexOf(boundary));
                commandOutput += finalChunk;

                // 将最后的干净数据块发送到GUI
                if (guiWindow && !guiWindow.isDestroyed() && finalChunk) {
                    guiWindow.webContents.send('powershell-data', finalChunk);
                }
                
                // 解析Promise，完成AI工具调用
                resolve(stripAnsi(commandOutput.trim()));
            } else {
                // 如果没有边界，这是正常的命令输出
                commandOutput += dataStr;
                // 将中间输出实时发送到GUI
                if (guiWindow && !guiWindow.isDestroyed()) {
                    guiWindow.webContents.send('powershell-data', dataStr);
                }
            }
        };

        const timeoutId = setTimeout(() => {
            ptyProcess.removeListener('data', dataListener);
            reject(new Error(`Command "${singleCommand}" timed out after 60 seconds.`));
        }, 60000);

        ptyProcess.on('data', dataListener);
        ptyProcess.write(`${singleCommand}\r\nWrite-Host "${boundary}"\r\n`);
    });
}


async function processToolCall(args) {
    // --- 1. 解析和排序命令 ---
    const commandEntries = Object.entries(args)
        .filter(([key]) => key.startsWith('command'))
        .map(([key, value]) => {
            const match = key.match(/^command(\d*)$/);
            // command -> 0, command1 -> 1, command2 -> 2
            const index = match ? (match[1] === '' ? 0 : parseInt(match[1], 10)) : -1;
            return { key, value, index };
        })
        .filter(item => item.index !== -1)
        .sort((a, b) => a.index - b.index);

    if (commandEntries.length === 0) {
        throw new Error('未提供任何有效的 command 参数 (例如 command, command1, command2)。');
    }

    // --- 2. 初始化会话和参数 ---
    // 使用最后一个命令条目中的参数作为基础，或者使用全局默认值
    const lastCommandIndex = commandEntries[commandEntries.length - 1].index;
    const getArg = (key, defaultVal) => {
        const indexedKey = `${key}${lastCommandIndex || ''}`;
        return args[indexedKey] !== undefined ? args[indexedKey] : (args[key] !== undefined ? args[key] : defaultVal);
    };

    const requireAdmin = getArg('requireAdmin', false);
    const newSession = getArg('newSession', false);
    const finalReturnMode = getArg('returnMode', defaultConfig.returnMode);

    // --- 3. 管理员模式执行 (不支持命令链) ---
    if (requireAdmin) {
        if (commandEntries.length > 1) {
            throw new Error("管理员模式 (requireAdmin: true) 不支持执行多个命令链 (command1, command2, ...)。");
        }
        if (ptyProcess) {
            ptyProcess.kill();
            ptyProcess = null;
        }
        const command = commandEntries[0].value;
        const fullCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`;
        return executeAdminCommand(fullCommand);
    }

    // --- 4. 非管理员会话执行 ---
    ensureGuiWindow();

    if (newSession || !ptyProcess) {
        createNewPtySession();
        await new Promise(resolve => setTimeout(resolve, 500)); // 等待PTY初始化
    }

    const deltaOutputs = [];

    isExecutingCommand = true; // 阻止 guiDataListener 发送原始数据
    try {
        for (const entry of commandEntries) {
            const command = entry.value;
            // 检查是否有针对此特定命令的 returnMode
            const currentReturnModeKey = `returnMode${entry.index || ''}`;
            const currentReturnMode = args[currentReturnModeKey] || finalReturnMode;

            try {
                const output = await executeSingleCommandInPty(ptyProcess, command);
                // 即使是full模式，我们也需要收集增量输出，以备最终格式化
                deltaOutputs.push({ command, output, returnMode: currentReturnMode });
            } catch (error) {
                throw new Error(`在执行命令 "${command}" 时出错: ${error.message}`);
            }
        }
    } finally {
        isExecutingCommand = false; // 恢复 guiDataListener
    }

    // --- 5. 格式化并返回结果 ---
    if (finalReturnMode === 'full') {
        // 'full' 模式现在无法再支持，因为它依赖于已移除的 fullTerminalHistory
        // 将其行为降级为返回最后一个命令的 delta 输出
        return deltaOutputs.length > 0 ? deltaOutputs[deltaOutputs.length - 1].output : '';
    } else { // delta 模式
        if (deltaOutputs.length === 1) {
            return deltaOutputs[0].output;
        }
        return deltaOutputs.map(res =>
            `---[Output for: ${res.command}]---\n${res.output}`
        ).join('\n\n');
    }
}

/**
 * 清理插件资源，在主程序退出或插件重载时调用。
 */
function cleanup() {
    console.log('[PowerShellExecutor] 正在清理资源...');

    // 1. 关闭并销毁 GUI 窗口
    if (guiWindow && !guiWindow.isDestroyed()) {
        try {
            // 移除 'closed' 监听器，以避免在程序化关闭时触发额外的 ptyProcess.kill()
            guiWindow.removeAllListeners('closed');
            guiWindow.close();
            console.log('[PowerShellExecutor] GUI 窗口已关闭。');
        } catch (e) {
            console.error('[PowerShellExecutor] 关闭 GUI 窗口时出错:', e);
        }
        guiWindow = null;
    }

    // 2. 终止所有跟踪的子进程
    if (childProcesses.size > 0) {
        console.log(`[PowerShellExecutor] 正在终止 ${childProcesses.size} 个子进程...`);
        for (const processToKill of childProcesses) {
            try {
                // ptyProcess 和 child_process 对象都有一个 .kill() 方法
                processToKill.kill();
                console.log(`[PowerShellExecutor] 进程 (PID: ${processToKill.pid}) 已终止。`);
            } catch (e) {
                console.error(`[PowerShellExecutor] 终止进程 (PID: ${processToKill.pid}) 时出错:`, e);
            }
        }
        childProcesses.clear();
    }

    // 3. 停止文件监视器
    if (settingsWatcher) {
        try {
            settingsWatcher.close();
            settingsWatcher = null;
            console.log('[PowerShellExecutor] Settings file watcher stopped.');
        } catch (e) {
            console.error('[PowerShellExecutor] Error stopping settings watcher:', e);
        }
    }

    // 4. 确保 ptyProcess 状态被重置
    ptyProcess = null;
}

// 导出 processToolCall 函数和 cleanup 函数
module.exports = {
    processToolCall,
    cleanup
};