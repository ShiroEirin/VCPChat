// modules/renderer/contentProcessor.js

let mainRefs = {};

/**
 * Initializes the content processor with necessary references.
 * @param {object} refs - References to main modules and utilities.
 */
function initializeContentProcessor(refs) {
    mainRefs = refs;
}

/**
 * Ensures that triple backticks for code blocks are followed by a newline.
 * @param {string} text The input string.
 * @returns {string} The processed string with newlines after ``` if they were missing.
 */
function ensureNewlineAfterCodeBlock(text) {
    if (typeof text !== 'string') return text;
    // Replace ``` (possibly with leading spaces) not followed by \n or \r\n with the same ``` (and spaces) followed by \n
    return text.replace(/^(\s*```)(?![\r\n])/gm, '$1\n');
}

/**
 * Ensures that a tilde (~) is followed by a space, to prevent accidental strikethrough.
 * It avoids doing this for tildes inside URLs or file paths.
 * @param {string} text The input string.
 * @returns {string} The processed string with spaces after tildes where they were missing.
 */
function ensureSpaceAfterTilde(text) {
    if (typeof text !== 'string') return text;
    // Replace a tilde `~` with `~ ` to prevent it from being interpreted as a strikethrough marker.
    // This should not affect tildes in URLs (e.g., `.../~user/`) or code (e.g., `var_~a`).
    // The regex matches a tilde if it's:
    // 1. At the start of the string (`^`).
    // 2. Preceded by a character that is NOT a word character (`\w`), path separator (`/`, `\`), or equals sign (`=`).
    // It also ensures it's not already followed by a space or another tilde `(?![\s~])`.
    return text.replace(/(^|[^\w/\\=])~(?![\s~])/g, '$1~ ');
}

/**
 * Removes leading whitespace from lines starting with ``` (code block markers).
 * @param {string} text The input string.
 * @returns {string} The processed string.
 */
function removeIndentationFromCodeBlockMarkers(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/^(\s*)(```.*)/gm, '$2');
}

/**
 * Removes speaker tags like "[Sender's speech]: " from the beginning of a string.
 * @param {string} text The input string.
 * @returns {string} The processed string without the leading speaker tag.
 */
function removeSpeakerTags(text) {
    if (typeof text !== 'string') return text;
    const speakerTagRegex = /^\[(?:(?!\]:\s).)*的发言\]:\s*/;
    let newText = text;
    // Loop to remove all occurrences of the speaker tag at the beginning of the string
    while (speakerTagRegex.test(newText)) {
        newText = newText.replace(speakerTagRegex, '');
    }
    return newText;
}

/**
* Ensures there is a separator between an <img> tag and a subsequent code block fence (```).
* This prevents the markdown parser from failing to recognize the code block.
* It inserts a double newline and an HTML comment. The comment acts as a "hard" separator
* for the markdown parser, forcing it to reset its state after the raw HTML img tag.
* @param {string} text The input string.
* @returns {string} The processed string.
*/
function ensureSeparatorBetweenImgAndCode(text) {
    if (typeof text !== 'string') return text;
    // Looks for an <img> tag, optional whitespace, and then a ```.
    // Inserts a double newline and an HTML comment.
    return text.replace(/(<img[^>]+>)\s*(```)/g, '$1\n\n<!-- VCP-Renderer-Separator -->\n\n$2');
}


/**
 * Removes leading whitespace from special VCP blocks like Tool Requests.
 * This prevents the markdown parser from misinterpreting the entire indented
 * block as a single code block before it can be transformed into a bubble.
 * @param {string} text The input string.
 * @returns {string} The processed string.
 */
function deIndentToolRequestBlocks(text) {
    if (typeof text !== 'string') return text;

    const lines = text.split('\n');
    let inToolBlock = false;

    return lines.map(line => {
        const isStart = line.includes('<<<[TOOL_REQUEST]>>>');
        const isEnd = line.includes('<<<[END_TOOL_REQUEST]>>>');

        let needsTrim = false;
        // If a line contains the start marker, we begin trimming.
        if (isStart) {
            needsTrim = true;
            inToolBlock = true;
        }
        // If we are already in a block, we continue trimming.
        else if (inToolBlock) {
            needsTrim = true;
        }

        const processedLine = needsTrim ? line.trimStart() : line;

        // If a line contains the end marker, we stop trimming from the *next* line.
        if (isEnd) {
            inToolBlock = false;
        }

        return processedLine;
    }).join('\n');
}


/**
 * Parses VCP tool_name from content.
 * @param {string} toolContent - The raw string content of the tool request.
 * @returns {string|null} The extracted tool name or null.
 */
function extractVcpToolName(toolContent) {
    const match = toolContent.match(/tool_name:\s*「始」([^「」]+)「末」/);
    return match ? match[1] : null;
}

/**
 * Prettifies a single <pre> code block for DailyNote or VCP ToolUse.
 * @param {HTMLElement} preElement - The <pre> element to prettify.
 * @param {'dailynote' | 'vcptool'} type - The type of block.
 * @param {string} relevantContent - The relevant text content for the block.
 */
function prettifySinglePreElement(preElement, type, relevantContent) {
    if (!preElement || preElement.dataset.vcpPrettified === "true" || preElement.dataset.maidDiaryPrettified === "true") {
        return;
    }

    // Remove the <code> element to prevent Turndown's default code block rule from matching
    // This ensures our custom Turndown rule can handle these special blocks
    const codeElement = preElement.querySelector('code');
    if (codeElement) {
        // Move any copy buttons or other elements before removing
        const copyButton = codeElement.querySelector('.code-copy, .fa-copy');
        if (copyButton) {
            copyButton.remove();
        }
        // Remove the code wrapper, we'll set content directly on pre
        preElement.innerHTML = '';
    }

    if (type === 'vcptool') {
        preElement.classList.add('vcp-tool-use-bubble');
        const toolName = extractVcpToolName(relevantContent);

        let newInnerHtml = `<span class="vcp-tool-label">ToolUse:</span>`;
        if (toolName) {
            newInnerHtml += `<span class="vcp-tool-name-highlight">${toolName}</span>`;
        } else {
            newInnerHtml += `<span class="vcp-tool-name-highlight">UnknownTool</span>`;
        }

        preElement.innerHTML = newInnerHtml;
        preElement.dataset.vcpPrettified = "true";

    } else if (type === 'dailynote') {
        preElement.classList.add('maid-diary-bubble');
        let actualNoteContent = relevantContent.trim();

        let finalHtml = "";
        const lines = actualNoteContent.split('\n');
        const firstLineTrimmed = lines[0] ? lines[0].trim() : "";

        if (firstLineTrimmed.startsWith('Maid:')) {
            finalHtml = `<span class="maid-label">${lines.shift().trim()}</span>`;
            finalHtml += lines.join('\n');
        } else if (firstLineTrimmed.startsWith('Maid')) {
            finalHtml = `<span class="maid-label">${lines.shift().trim()}</span>`;
            finalHtml += lines.join('\n');
        } else {
            finalHtml = actualNoteContent;
        }

        preElement.innerHTML = finalHtml.replace(/\n/g, '<br>');
        preElement.dataset.maidDiaryPrettified = "true";
    }
}

const TAG_REGEX = /@([\u4e00-\u9fa5A-Za-z0-9_]+)/g;
const BOLD_REGEX = /\*\*([^\*]+)\*\*/g;
const QUOTE_REGEX = /(?:"([^"]*)"|“([^”]*)”)/g; // Matches English "..." and Chinese “...”

/**
 * 一次性高亮所有文本模式（标签、粗体、引号），替换旧的多次遍历方法
 * @param {HTMLElement} messageElement The message content element.
 */
function highlightAllPatternsInMessage(messageElement) {
    if (!messageElement) return;

    const walker = document.createTreeWalker(
        messageElement,
        NodeFilter.SHOW_TEXT,
        (node) => {
            let parent = node.parentElement;
            while (parent && parent !== messageElement) {
                if (['PRE', 'CODE', 'STYLE', 'SCRIPT', 'STRONG', 'B'].includes(parent.tagName) ||
                    parent.classList.contains('highlighted-tag') ||
                    parent.classList.contains('highlighted-quote')) {
                    return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
        false
    );

    const nodesToProcess = [];
    let node;

    try {
        while ((node = walker.nextNode())) {
            const text = node.nodeValue || '';
            if (!text) continue;
            const matches = [];

            // 收集所有匹配
            let match;
            while ((match = TAG_REGEX.exec(text)) !== null) {
                matches.push({ type: 'tag', index: match.index, length: match[0].length, content: match[0] });
            }
            while ((match = BOLD_REGEX.exec(text)) !== null) {
                matches.push({ type: 'bold', index: match.index, length: match[0].length, content: match[1] });
            }
            while ((match = QUOTE_REGEX.exec(text)) !== null) {
                // 确保引号内有内容
                if (match[1] || match[2]) {
                    matches.push({ type: 'quote', index: match.index, length: match[0].length, content: match[0] });
                }
            }

            if (matches.length > 0) {
                // 按位置排序
                matches.sort((a, b) => a.index - b.index);
                nodesToProcess.push({ node, matches });
            }
        }
    } catch (error) {
        if (!error.message.includes("no longer runnable")) {
            console.error("highlightAllPatterns: TreeWalker error", error);
        }
    }

    // 逆序处理节点
    for (let i = nodesToProcess.length - 1; i >= 0; i--) {
        const { node, matches } = nodesToProcess[i];
        if (!node.parentNode) continue;

        // 健壮的重叠匹配过滤逻辑
        const filteredMatches = [];
        let lastIndexProcessed = -1;
        for (const currentMatch of matches) {
            if (currentMatch.index >= lastIndexProcessed) {
                filteredMatches.push(currentMatch);
                lastIndexProcessed = currentMatch.index + currentMatch.length;
            }
        }

        if (filteredMatches.length === 0) continue;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        // 构建新的节点结构
        filteredMatches.forEach(match => {
            // 添加匹配前的文本
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex, match.index)));
            }

            // 创建高亮元素
            const span = document.createElement(match.type === 'bold' ? 'strong' : 'span');
            if (match.type === 'tag') {
                span.className = 'highlighted-tag';
                span.textContent = match.content;
            } else if (match.type === 'quote') {
                span.className = 'highlighted-quote';
                span.textContent = match.content;
            } else { // bold
                span.textContent = match.content;
            }
            fragment.appendChild(span);

            lastIndex = match.index + match.length;
        });

        // 添加剩余文本
        if (lastIndex < node.nodeValue.length) {
            fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex)));
        }

        node.parentNode.replaceChild(fragment, node);
    }
}

/**
 * Processes all relevant <pre> blocks within a message's contentDiv AFTER marked.parse().
 * @param {HTMLElement} contentDiv - The div containing the parsed Markdown.
 */
function processAllPreBlocksInContentDiv(contentDiv) {
    if (!contentDiv) return;

    const allPreElements = contentDiv.querySelectorAll('pre');
    allPreElements.forEach(preElement => {
        if (preElement.dataset.vcpPrettified === "true" || preElement.dataset.maidDiaryPrettified === "true") {
            return; // Already processed
        }

        const codeElement = preElement.querySelector('code');
        const blockText = codeElement ? (codeElement.textContent || "") : (preElement.textContent || "");
        // 在美化前，将原始文本内容存储到 data-* 属性中
        // 这是为了在后续的上下文净化过程中，能够恢复原始内容，避免特殊字符被转义
        preElement.setAttribute('data-raw-content', blockText);

        // Check for VCP Tool Request
        if (blockText.includes('<<<[TOOL_REQUEST]>>>') && blockText.includes('<<<[END_TOOL_REQUEST]>>>')) {
            const vcpContentMatch = blockText.match(/<<<\[TOOL_REQUEST\]>>>([\s\S]*?)<<<\[END_TOOL_REQUEST\]>>>/);
            const actualVcpText = vcpContentMatch ? vcpContentMatch[1].trim() : "";
            prettifySinglePreElement(preElement, 'vcptool', actualVcpText);
        }
        // Check for DailyNote
        else if (blockText.includes('<<<DailyNoteStart>>>') && blockText.includes('<<<DailyNoteEnd>>>')) {
            const dailyNoteContentMatch = blockText.match(/<<<DailyNoteStart>>>([\s\S]*?)<<<DailyNoteEnd>>>/);
            const actualDailyNoteText = dailyNoteContentMatch ? dailyNoteContentMatch[1].trim() : "";
            prettifySinglePreElement(preElement, 'dailynote', actualDailyNoteText);
        }
    });
}

/**
 * Processes interactive buttons in AI messages
 * @param {HTMLElement} contentDiv The message content element.
 */
function processInteractiveButtons(contentDiv) {
    if (!contentDiv) return;

    // Find all button elements
    const buttons = contentDiv.querySelectorAll('button');

    buttons.forEach(button => {
        // Skip if already processed
        if (button.dataset.vcpInteractive === 'true') return;

        // Mark as processed
        button.dataset.vcpInteractive = 'true';

        // Set up button styling
        setupButtonStyle(button);

        // Add click event listener
        button.addEventListener('click', handleAIButtonClick);

        console.log('[ContentProcessor] Processed interactive button:', button.textContent.trim());
    });
}

/**
 * Sets up functional properties for interactive buttons (no styling)
 * @param {HTMLElement} button The button element
 */
function setupButtonStyle(button) {
    // Ensure button looks clickable
    button.style.cursor = 'pointer';

    // Prevent any form submission or default behavior
    button.type = 'button';
    button.setAttribute('type', 'button');

    // Note: Visual styling is left to AI-defined CSS classes and styles
}

/**
 * Handles click events on AI-generated buttons
 * @param {Event} event The click event
 */
function handleAIButtonClick(event) {
    const button = event.target;

    // Completely prevent any default behavior
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Check if button is disabled
    if (button.disabled) {
        return false;
    }

    // Get text to send (priority: data-send attribute > button text)
    const sendText = button.dataset.send || button.textContent.trim();

    // Validate text
    if (!sendText || sendText.length === 0) {
        console.warn('[ContentProcessor] Button has no text to send');
        return false;
    }

    // Format the text to be sent
    let finalSendText = `[[点击按钮:${sendText}]]`;

    // Truncate if the final text is too long
    if (finalSendText.length > 500) {
        console.warn('[ContentProcessor] Button text too long, truncating');
        const maxTextLength = 500 - '[[点击按钮:]]'.length; // Account for '[[点击按钮:' and ']]'
        const truncatedText = sendText.substring(0, maxTextLength);
        finalSendText = `[[点击按钮:${truncatedText}]]`;
    }

    // Disable button to prevent double-click
    disableButton(button);

    // Send the message asynchronously to avoid blocking
    setTimeout(() => {
        sendButtonMessage(finalSendText, button);
    }, 10);

    return false;
}

/**
 * Disables a button and provides visual feedback
 * @param {HTMLElement} button The button to disable
 */
function disableButton(button) {
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';

    // Add checkmark to indicate it was clicked
    const originalText = button.textContent;
    button.textContent = originalText + ' ✓';

    // Store original text for potential restoration
    button.dataset.originalText = originalText;
}

/**
 * Restores a button to its original state
 * @param {HTMLElement} button The button to restore
 */
function restoreButton(button) {
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';

    // Restore original text if available
    if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
    }
}

/**
 * Sends a message triggered by button click
 * @param {string} text The text to send
 * @param {HTMLElement} button The button that triggered the send
 */
function sendButtonMessage(text, button) {
    try {
        // Check if chatManager is available
        if (window.chatManager && typeof window.chatManager.handleSendMessage === 'function') {
            // Use the main chat manager for regular chat
            sendMessageViaMainChat(text);
        } else if (window.sendMessage && typeof window.sendMessage === 'function') {
            // Use direct sendMessage function (for voice chat, assistant modules)
            window.sendMessage(text);
        } else {
            throw new Error('No message sending function available');
        }

        console.log('[ContentProcessor] Button message sent:', text);

    } catch (error) {
        console.error('[ContentProcessor] Failed to send button message:', error);

        // Restore button on error
        restoreButton(button);

        // Show error notification
        showErrorNotification('发送失败，请重试');
    }
}

/**
 * Sends message via main chat interface
 * @param {string} text The text to send
 */
function sendMessageViaMainChat(text) {
    // Get the message input element
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) {
        throw new Error('Message input not found');
    }

    // Set the text in input and trigger send
    messageInput.value = text;
    window.chatManager.handleSendMessage();

    // Note: handleSendMessage will clear the input automatically
}

/**
 * Shows an error notification to the user
 * @param {string} message The error message
 */
function showErrorNotification(message) {
    // Try to use existing notification system
    if (window.uiHelper && typeof window.uiHelper.showToastNotification === 'function') {
        window.uiHelper.showToastNotification(message, 'error');
        return;
    }

    // Fallback: create a simple notification
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            document.body.removeChild(notification);
        }
    }, 3000);
}

/**
 * Applies synchronous post-render processing to the message content.
 * This handles tasks like KaTeX, code highlighting, and button processing
 * that do not depend on a fully stable DOM tree from complex innerHTML.
 * @param {HTMLElement} contentDiv The message content element.
 */
function processRenderedContent(contentDiv) {
    if (!contentDiv) return;

    // KaTeX rendering
    if (window.renderMathInElement) {
        window.renderMathInElement(contentDiv, {
            delimiters: [
                {left: "$$", right: "$$", display: true}, {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false}, {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    }

    // Special block formatting (VCP/Diary)
    processAllPreBlocksInContentDiv(contentDiv);

    // Process interactive buttons
    processInteractiveButtons(contentDiv);

    // Apply syntax highlighting to code blocks
    if (window.hljs) {
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            // Only highlight if the block hasn't been specially prettified (e.g., DailyNote or VCP ToolUse)
            if (!block.parentElement.dataset.vcpPrettified && !block.parentElement.dataset.maidDiaryPrettified) {
                window.hljs.highlightElement(block);
            }
        });
    }
}



/**
 * 为 CSS 字符串中的所有选择器添加作用域 ID 前缀。
 * @param {string} cssString - 原始 CSS 文本。
 * @param {string} scopeId - 唯一的作用域 ID (不带 #)。
 * @returns {string} 处理后的 CSS 文本。
 */
function scopeSelector(selector, scopeId) {
    // 跳过特殊选择器
    if (selector.match(/^(@|from|to|\d+%|:root|html|body)/)) {
        return selector;
    }
    
    // 处理伪类/伪元素
    if (selector.match(/^::?[\w-]+$/)) {
        return `#${scopeId}${selector}`;
    }
    
    return `#${scopeId} ${selector}`;
}

function scopeCss(cssString, scopeId) {
    // 1. 先移除注释
    let css = cssString.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 2. 分割规则
    const rules = [];
    let depth = 0;
    let currentRule = '';
    
    for (let i = 0; i < css.length; i++) {
        const char = css[i];
        currentRule += char;
        
        if (char === '{') depth++;
        else if (char === '}') {
            depth--;
            if (depth === 0) {
                rules.push(currentRule.trim());
                currentRule = '';
            }
        }
    }
    
    // 3. 处理每个规则
    return rules.map(rule => {
        const match = rule.match(/^([^{]+)\{(.+)\}$/s);
        if (!match) return rule;
        
        const [, selectors, body] = match;
        const scopedSelectors = selectors
            .split(',')
            .map(s => scopeSelector(s.trim(), scopeId))
            .join(', ');
        
        return `${scopedSelectors} { ${body} }`;
    }).join('\n');
}


/**
 * Applies a series of common text processing rules in a single pass.
 * @param {string} text The input string.
 * @returns {string} The processed string.
 */
function applyContentProcessors(text) {
    if (typeof text !== 'string') return text;
    
    // Chain multiple regex replacements for efficiency
    return text
        // ensureNewlineAfterCodeBlock
        .replace(/^(\s*```)(?![\r\n])/gm, '$1\n')
        // ensureSpaceAfterTilde
        .replace(/(^|[^\w/\\=])~(?![\s~])/g, '$1~ ')
        // removeIndentationFromCodeBlockMarkers
        .replace(/^(\s*)(```.*)/gm, '$2')
         // removeSpeakerTags - Simplified regex to remove all occurrences at the start
        .replace(/^(\[(?:(?!\]:\s).)*的发言\]:\s*)+/g, '')
        // ensureSeparatorBetweenImgAndCode
        .replace(/(<img[^>]+>)\s*(```)/g, '$1\n\n<!-- VCP-Renderer-Separator -->\n\n$2')
        // New FIX: ensureSeparatorBetweenImgAndText
        // Prevents text from merging into a paragraph with a single image, which breaks centering.
        // It looks for a closing </p> or an <img> tag, followed by text that is not another tag.
        .replace(/(<\/p>|<img[^>]+>)\s*(?=[^\s<])/g, '$1\n\n');
}


export {
    initializeContentProcessor,
    ensureNewlineAfterCodeBlock,
    ensureSpaceAfterTilde,
    removeIndentationFromCodeBlockMarkers,
    removeSpeakerTags,
    ensureSeparatorBetweenImgAndCode,
    deIndentToolRequestBlocks,
    processAllPreBlocksInContentDiv,
    processRenderedContent,
    processInteractiveButtons,
    handleAIButtonClick,
    highlightAllPatternsInMessage, // Export the new async highlighter
    sendButtonMessage,
    scopeCss, // Export the new CSS scoping function
    applyContentProcessors // Export the new batch processor
};
