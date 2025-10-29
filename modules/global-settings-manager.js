/**
 * This module handles the logic for saving global settings.
 */
export async function handleSaveGlobalSettings(e, deps) {
    e.preventDefault();

    const {
        refs,
        getCroppedFile,
        setCroppedFile,
        uiHelperFunctions,
        settingsManager
    } = deps;

    const networkNotesPathsContainer = document.getElementById('networkNotesPathsContainer');
    const pathInputs = networkNotesPathsContainer.querySelectorAll('input[name="networkNotesPath"]');
    const networkNotesPaths = Array.from(pathInputs).map(input => input.value.trim()).filter(path => path);

    const newSettings = {
        userName: document.getElementById('userName').value.trim() || '用户',
        userAvatarBorderColor: document.getElementById('userAvatarBorderColor')?.value || '#3d5a80',
        userNameTextColor: document.getElementById('userNameTextColor')?.value || '#ffffff',
        userUseThemeColorsInChat: document.getElementById('userUseThemeColorsInChat')?.checked || false,
        continueWritingPrompt: document.getElementById('continueWritingPrompt').value.trim() || '请继续',
        flowlockContinueDelay: parseInt(document.getElementById('flowlockContinueDelay').value, 10) || 5,
        enableMiddleClickQuickAction: document.getElementById('enableMiddleClickQuickAction').checked,
        middleClickQuickAction: document.getElementById('middleClickQuickAction').value,
        enableMiddleClickAdvanced: document.getElementById('enableMiddleClickAdvanced').checked,
        middleClickAdvancedDelay: Math.max(1000, parseInt(document.getElementById('middleClickAdvancedDelay').value, 10) || 1000),
        enableRegenerateConfirmation: document.getElementById('enableRegenerateConfirmation').checked,
        vcpServerUrl: settingsManager.completeVcpUrl(document.getElementById('vcpServerUrl').value.trim()),
        vcpApiKey: document.getElementById('vcpApiKey').value,
        vcpLogUrl: document.getElementById('vcpLogUrl').value.trim(),
        vcpLogKey: document.getElementById('vcpLogKey').value.trim(),
        topicSummaryModel: document.getElementById('topicSummaryModel').value.trim(),
        networkNotesPaths: networkNotesPaths,
        sidebarWidth: refs.globalSettings.get().sidebarWidth,
        notificationsSidebarWidth: refs.globalSettings.get().notificationsSidebarWidth,
        enableAgentBubbleTheme: document.getElementById('enableAgentBubbleTheme').checked,
        enableSmoothStreaming: document.getElementById('enableSmoothStreaming').checked,
        minChunkBufferSize: parseInt(document.getElementById('minChunkBufferSize').value, 10) || 16,
        smoothStreamIntervalMs: parseInt(document.getElementById('smoothStreamIntervalMs').value, 10) || 100,
        assistantAgent: document.getElementById('assistantAgent').value,
        enableDistributedServer: document.getElementById('enableDistributedServer').checked,
        agentMusicControl: document.getElementById('agentMusicControl').checked,
        enableVcpToolInjection: document.getElementById('enableVcpToolInjection').checked,
        enableContextSanitizer: document.getElementById('enableContextSanitizer').checked,
        contextSanitizerDepth: parseInt(document.getElementById('contextSanitizerDepth').value, 10) || 0,
    };

    const userAvatarCropped = getCroppedFile('user');
    if (userAvatarCropped) {
        try {
            const arrayBuffer = await userAvatarCropped.arrayBuffer();
            const avatarSaveResult = await window.electronAPI.saveUserAvatar({
                name: userAvatarCropped.name,
                type: userAvatarCropped.type,
                buffer: arrayBuffer
            });
            if (avatarSaveResult.success) {
                refs.globalSettings.get().userAvatarUrl = avatarSaveResult.avatarUrl;
                document.getElementById('userAvatarPreview').src = avatarSaveResult.avatarUrl;
                document.getElementById('userAvatarPreview').style.display = 'block';
                if (window.messageRenderer) {
                    window.messageRenderer.setUserAvatar(avatarSaveResult.avatarUrl);
                }
                if (avatarSaveResult.needsColorExtraction && window.electronAPI && window.electronAPI.saveAvatarColor) {
                    if (window.getDominantAvatarColor) {
                        window.getDominantAvatarColor(avatarSaveResult.avatarUrl).then(avgColor => {
                            if (avgColor) {
                                window.electronAPI.saveAvatarColor({ type: 'user', id: 'user_global', color: avgColor })
                                    .then((saveColorResult) => {
                                        if (saveColorResult && saveColorResult.success) {
                                            refs.globalSettings.get().userAvatarCalculatedColor = avgColor;
                                            if (window.messageRenderer) window.messageRenderer.setUserAvatarColor(avgColor);
                                        } else {
                                            console.warn("Failed to save user avatar color:", saveColorResult?.error);
                                        }
                                    }).catch(err => console.error("Error saving user avatar color:", err));
                            }
                        });
                    }
                }
                setCroppedFile('user', null);
                document.getElementById('userAvatarInput').value = '';
            } else {
                uiHelperFunctions.showToastNotification(`保存用户头像失败: ${avatarSaveResult.error}`, 'error');
            }
        } catch (readError) {
            uiHelperFunctions.showToastNotification(`读取用户头像文件失败: ${readError.message}`, 'error');
        }
    }

    const result = await window.electronAPI.saveSettings(newSettings);
    if (result.success) {
        Object.assign(refs.globalSettings.get(), newSettings);
        uiHelperFunctions.showToastNotification('全局设置已保存！部分设置（如通知URL/Key）可能需要重新连接生效。');
        uiHelperFunctions.closeModal('globalSettingsModal');
        if (refs.globalSettings.get().vcpLogUrl && refs.globalSettings.get().vcpLogKey) {
             window.electronAPI.connectVCPLog(refs.globalSettings.get().vcpLogUrl, refs.globalSettings.get().vcpLogKey);
        } else {
             window.electronAPI.disconnectVCPLog();
             if (window.notificationRenderer) window.notificationRenderer.updateVCPLogStatus({ status: 'error', message: 'VCPLog未配置' }, document.getElementById('vcpLogConnectionStatus'));
        }
   } else {
       uiHelperFunctions.showToastNotification(`保存全局设置失败: ${result.error}`, 'error');
    }
}