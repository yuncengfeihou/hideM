// index.js (优化版，确保聊天模式设置优先)
import { extension_settings, loadExtensionSettings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders, characters } from "../../../../script.js";
import { groups } from "../../../group-chats.js";

const extensionName = "hide";
const defaultSettings = {
    enabled: true,
    settings_by_entity: {},
    migration_v1_complete: false,
    useGlobalSettings: false,
    globalHideSettings: {
        hideLastN: 0,
        lastProcessedLength: 0,
        userConfigured: false
    }
};

let cachedContext = null;

const domCache = {
    hideLastNInput: null,
    saveBtn: null,
    currentValueDisplay: null,
    init() {
        console.debug(`[${extensionName} DEBUG] Initializing DOM cache.`);
        this.hideLastNInput = document.getElementById('hide-last-n');
        this.saveBtn = document.getElementById('hide-save-settings-btn');
        this.currentValueDisplay = document.getElementById('hide-current-value');
        console.debug(`[${extensionName} DEBUG] DOM cache initialized:`, {
            hideLastNInput: !!this.hideLastNInput,
            saveBtn: !!this.saveBtn,
            currentValueDisplay: !!this.currentValueDisplay
        });
    }
};

function getContextOptimized() {
    console.debug(`[${extensionName} DEBUG] Entering getContextOptimized.`);
    if (!cachedContext) {
        console.debug(`[${extensionName} DEBUG] Context cache miss. Calling getContext().`);
        cachedContext = getContext();
        console.debug(`[${extensionName} DEBUG] Context fetched:`, cachedContext ? `CharacterId: ${cachedContext.characterId}, GroupId: ${cachedContext.groupId}, Chat Length: ${cachedContext.chat?.length}` : 'null');
    } else {
        console.debug(`[${extensionName} DEBUG] Context cache hit.`);
    }
    return cachedContext;
}

function getCurrentEntityId() {
    const context = getContextOptimized();
    if (!context) return null;

    if (context.groupId) {
        return `group-${context.groupId}`;
    } else if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
        const character = context.characters[context.characterId];
        if (character.avatar) {
            return `character-${character.avatar}`;
        } else {
            console.warn(`[${extensionName}] Cannot determine entityId for character at index ${context.characterId}: Missing avatar filename.`);
            return null;
        }
    }
    console.debug(`[${extensionName} DEBUG] Could not determine entityId from context.`);
    return null;
}

function runMigration() {
    console.log(`[${extensionName}] === 开始设置迁移过程 ===`);
    let migratedCount = 0;
    extension_settings[extensionName].settings_by_entity = extension_settings[extensionName].settings_by_entity || {};
    const settingsContainer = extension_settings[extensionName].settings_by_entity;
    console.log(`[${extensionName}] 目标设置容器已初始化/找到。`);

    // 迁移角色数据
    if (typeof characters !== 'undefined' && Array.isArray(characters)) {
        console.log(`[${extensionName}] 全局 'characters' 数组已找到。角色数量: ${characters.length}。`);
        characters.forEach((character, index) => {
            console.log(`[${extensionName}] 处理角色 #${index}: ${character ? character.name : '不可用'}`);
            if (!character || !character.data || !character.data.extensions) {
                console.log(`[${extensionName}]   跳过角色 #${index}: 缺少角色对象、data 或 extensions 属性。`);
                return;
            }
            try {
                const oldSettings = character.data.extensions.hideHelperSettings;
                if (oldSettings && typeof oldSettings === 'object' && oldSettings !== null) {
                    const hasHideLastN = typeof oldSettings.hideLastN === 'number';
                    const hasLastProcessedLength = typeof oldSettings.lastProcessedLength === 'number';
                    const isUserConfigured = oldSettings.userConfigured === true;
                    const isValidOldData = hasHideLastN || hasLastProcessedLength || isUserConfigured;
                    
                    if (isValidOldData && character.avatar) {
                        const entityId = `character-${character.avatar}`;
                        if (!settingsContainer.hasOwnProperty(entityId)) {
                            settingsContainer[entityId] = { ...oldSettings };
                            migratedCount++;
                        }
                    }
                }
            } catch (charError) {
                console.error(`[${extensionName}]   错误: 迁移角色设置时出错:`, charError);
            }
        });
    }

    // 迁移群组数据
    if (typeof groups !== 'undefined' && Array.isArray(groups)) {
        groups.forEach((group, index) => {
            if (!group || !group.data) return;
            try {
                const oldSettings = group.data.hideHelperSettings;
                if (oldSettings && typeof oldSettings === 'object' && oldSettings !== null && group.id) {
                    const entityId = `group-${group.id}`;
                    if (!settingsContainer.hasOwnProperty(entityId)) {
                        settingsContainer[entityId] = { ...oldSettings };
                        migratedCount++;
                    }
                }
            } catch (groupError) {
                console.error(`[${extensionName}]   错误: 迁移群组设置时出错:`, groupError);
            }
        });
    }

    extension_settings[extensionName].migration_v1_complete = true;
    saveSettingsDebounced();
}

function loadSettings() {
    console.log(`[${extensionName}] Entering loadSettings.`);
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    Object.assign(extension_settings[extensionName], {
        enabled: extension_settings[extensionName].hasOwnProperty('enabled') ? extension_settings[extensionName].enabled : defaultSettings.enabled,
        settings_by_entity: extension_settings[extensionName].settings_by_entity || { ...defaultSettings.settings_by_entity },
        migration_v1_complete: extension_settings[extensionName].migration_v1_complete || defaultSettings.migration_v1_complete,
        useGlobalSettings: extension_settings[extensionName].hasOwnProperty('useGlobalSettings') 
            ? extension_settings[extensionName].useGlobalSettings 
            : defaultSettings.useGlobalSettings,
        globalHideSettings: extension_settings[extensionName].globalHideSettings || { ...defaultSettings.globalHideSettings }
    });

    if (!extension_settings[extensionName].migration_v1_complete) {
        try {
            runMigration();
        } catch (error) {
            console.error(`[${extensionName}] 执行迁移时发生错误:`, error);
        }
    }
}

function createUI() {
    const settingsHtml = `
    <div id="hide-helper-settings" class="hide-helper-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>隐藏助手</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="hide-helper-section">
                    <div class="hide-helper-toggle-row">
                        <span class="hide-helper-label">插件状态:</span>
                        <select id="hide-helper-toggle">
                            <option value="enabled">开启</option>
                            <option value="disabled">关闭</option>
                        </select>
                    </div>
                </div>
                <hr class="sysHR">
            </div>
        </div>
    </div>`;

    $("#extensions_settings").append(settingsHtml);
    createInputWandButton();
    createPopup();
    setupEventListeners();
    setTimeout(() => domCache.init(), 100);
}

function createInputWandButton() {
    const buttonHtml = `
    <div id="hide-helper-wand-button" class="list-group-item flex-container flexGap5" title="隐藏助手">
        <span style="padding-top: 2px;"><i class="fa-solid fa-ghost"></i></span>
        <span>隐藏助手</span>
    </div>`;
    $('#data_bank_wand_container').append(buttonHtml);
}

function createPopup() {
    const popupHtml = `
    <div id="hide-helper-popup" class="hide-helper-popup">
        <div class="hide-helper-popup-title">隐藏助手设置</div>
        <div class="hide-helper-input-row">
            <button id="hide-save-settings-btn" class="hide-helper-btn">保存设置</button>
            <div class="hide-helper-input-container">
                <input type="number" id="hide-last-n" min="0" placeholder="隐藏最近N楼之前的消息">
            </div>
            <button id="hide-unhide-all-btn" class="hide-helper-btn">取消隐藏</button>
        </div>
        <div class="hide-helper-current">
            <strong>当前隐藏设置:</strong> <span id="hide-current-value">无</span>
        </div>
        <div class="hide-helper-popup-footer">
            <button id="hide-settings-type-btn" class="hide-helper-btn">聊天模式</button>
            <button id="hide-helper-popup-close" class="hide-helper-close-btn">关闭</button>
            <button id="hide-helper-instructions-btn" class="hide-helper-btn">使用说明</button>
        </div>
    </div>`;
    $('body').append(popupHtml);
}

// 修改后的核心函数 - 优先返回聊天模式设置
function getCurrentHideSettings() {
    const entityId = getCurrentEntityId();
    
    // 1. 优先检查聊天模式设置
    if (entityId) {
        const entitySettings = extension_settings[extensionName]?.settings_by_entity?.[entityId];
        if (entitySettings && (entitySettings.userConfigured || entitySettings.hideLastN > 0)) {
            return entitySettings;
        }
    }
    
    // 2. 只有没有聊天模式设置时才检查全局设置
    if (extension_settings[extensionName]?.useGlobalSettings) {
        return extension_settings[extensionName]?.globalHideSettings || null;
    }
    
    return null;
}

function saveCurrentHideSettings(hideLastN) {
    const context = getContextOptimized();
    if (!context) return false;

    const chatLength = context.chat?.length || 0;
    const settingsToSave = {
        hideLastN: hideLastN >= 0 ? hideLastN : 0,
        lastProcessedLength: chatLength,
        userConfigured: true // 确保标记为用户配置
    };

    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    if (extension_settings[extensionName].useGlobalSettings) {
        extension_settings[extensionName].globalHideSettings = settingsToSave;
    } else {
        const entityId = getCurrentEntityId();
        if (!entityId) return false;
        
        extension_settings[extensionName].settings_by_entity = extension_settings[extensionName].settings_by_entity || {};
        extension_settings[extensionName].settings_by_entity[entityId] = settingsToSave;
    }

    saveSettingsDebounced();
    return true;
}

function updateCurrentHideSettingsDisplay() {
    const currentSettings = getCurrentHideSettings();
    const displayValue = (currentSettings && currentSettings.hideLastN > 0) ? currentSettings.hideLastN : '无';
    
    if (domCache.currentValueDisplay) {
        domCache.currentValueDisplay.textContent = displayValue;
    }
    
    if (domCache.hideLastNInput) {
        domCache.hideLastNInput.value = currentSettings?.hideLastN > 0 ? currentSettings.hideLastN : '';
    }
    
    const $typeBtn = $('#hide-settings-type-btn');
    if ($typeBtn.length) {
        $typeBtn.text(extension_settings[extensionName]?.useGlobalSettings ? '全局模式' : '聊天模式');
    }
}

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function showInstructions() {
    $('#hide-helper-instructions-popup').remove();
    
    const instructionsHtml = `
    <div id="hide-helper-instructions-popup" class="hide-helper-instructions-popup">
        <!-- 保持原有的使用说明HTML -->
    </div>`;
    
    $('body').append(instructionsHtml);
    $('#hide-helper-instructions-close').on('click', function() {
        $('#hide-helper-instructions-popup').remove();
    });
}

function shouldProcessHiding() {
    if (!extension_settings[extensionName]?.enabled) return false;
    const settings = getCurrentHideSettings();
    return settings && (settings.userConfigured || settings.hideLastN > 0);
}

async function runIncrementalHideCheck() {
    if (!shouldProcessHiding()) return;

    const context = getContextOptimized();
    if (!context || !context.chat) return;

    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0, lastProcessedLength: 0 };
    const { hideLastN, lastProcessedLength = 0 } = settings;

    if (currentChatLength === 0 || hideLastN <= 0) {
        if (currentChatLength !== lastProcessedLength) {
            saveCurrentHideSettings(hideLastN);
        }
        return;
    }

    const targetVisibleStart = Math.max(0, currentChatLength - hideLastN);
    const previousVisibleStart = lastProcessedLength > 0 ? Math.max(0, lastProcessedLength - hideLastN) : 0;

    if (targetVisibleStart > previousVisibleStart) {
        const toHideIncrementally = [];
        for (let i = previousVisibleStart; i < targetVisibleStart; i++) {
            if (chat[i] && chat[i].is_system !== true) {
                toHideIncrementally.push(i);
            }
        }

        if (toHideIncrementally.length > 0) {
            toHideIncrementally.forEach(idx => { if (chat[idx]) chat[idx].is_system = true; });
            saveCurrentHideSettings(hideLastN);
        }
    }
}

async function runFullHideCheck() {
    if (!shouldProcessHiding()) return;

    const context = getContextOptimized();
    if (!context || !context.chat) return;
    
    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings() || { hideLastN: 0 };
    const { hideLastN } = settings;

    const visibleStart = hideLastN <= 0 ? 0 : (hideLastN >= currentChatLength ? 0 : Math.max(0, currentChatLength - hideLastN));

    const toHide = [];
    const toShow = [];
    
    for (let i = 0; i < currentChatLength; i++) {
        const msg = chat[i];
        if (!msg) continue;
        
        const isCurrentlyHidden = msg.is_system === true;
        const shouldBeHidden = i < visibleStart;

        if (shouldBeHidden && !isCurrentlyHidden) {
            msg.is_system = true;
            toHide.push(i);
        } else if (!shouldBeHidden && isCurrentlyHidden) {
            msg.is_system = false;
            toShow.push(i);
        }
    }

    if (toHide.length > 0 || toShow.length > 0) {
        saveCurrentHideSettings(hideLastN);
    }
}

async function unhideAllMessages() {
    const context = getContextOptimized();
    if (!context || !context.chat) {
        saveCurrentHideSettings(0);
        return;
    }

    const chat = context.chat;
    const toShow = [];
    
    for (let i = 0; i < chat.length; i++) {
        if (chat[i] && chat[i].is_system === true) {
            toShow.push(i);
        }
    }

    if (toShow.length > 0) {
        toShow.forEach(idx => { if (chat[idx]) chat[idx].is_system = false; });
    }

    saveCurrentHideSettings(0);
    updateCurrentHideSettingsDisplay();
}

function setupEventListeners() {
    // 弹出对话框按钮
    $('#hide-helper-wand-button').on('click', function() {
        if (!extension_settings[extensionName]?.enabled) {
            toastr.warning('隐藏助手当前已禁用，请在扩展设置中启用。');
            return;
        }
        
        updateCurrentHideSettingsDisplay();
        const $popup = $('#hide-helper-popup');
        $popup.css({
            'display': 'block', 'visibility': 'hidden', 'position': 'fixed',
            'left': '50%', 'transform': 'translateX(-50%)'
        });
        
        setTimeout(() => {
            const popupHeight = $popup.outerHeight();
            const windowHeight = $(window).height();
            const topPosition = Math.max(10, Math.min((windowHeight - popupHeight) / 2, windowHeight - popupHeight - 50));
            $popup.css({ 'top': topPosition + 'px', 'visibility': 'visible' });
        }, 0);
    });

    // 关闭按钮
    $('#hide-helper-popup-close').on('click', function() {
        $('#hide-helper-popup').hide();
    });

    // 使用说明按钮
    $('#hide-helper-instructions-btn').on('click', showInstructions);

    // 全局启用/禁用切换
    $('#hide-helper-toggle').on('change', function() {
        const isEnabled = $(this).val() === 'enabled';
        if (extension_settings[extensionName]) {
            extension_settings[extensionName].enabled = isEnabled;
            saveSettingsDebounced();
            if (isEnabled) {
                toastr.success('隐藏助手已启用');
                runFullHideCheckDebounced();
            } else {
                toastr.warning('隐藏助手已禁用');
            }
        }
    });

    // 设置类型切换 - 修改后的逻辑
    $('#hide-settings-type-btn').on('click', function() {
        const $btn = $(this);
        const currentMode = extension_settings[extensionName]?.useGlobalSettings;
        const newMode = !currentMode;
        
        if (extension_settings[extensionName]) {
            extension_settings[extensionName].useGlobalSettings = newMode;
            saveSettingsDebounced();
            
            $btn.text(newMode ? '全局模式' : '聊天模式');
            updateCurrentHideSettingsDisplay();
            
            // 只有当切换到全局模式且当前没有聊天模式设置时，才应用全局设置
            if (newMode) {
                const entitySettings = getCurrentHideSettings();
                if (!entitySettings || !entitySettings.userConfigured) {
                    runFullHideCheckDebounced();
                }
            } else {
                runFullHideCheckDebounced();
            }
            
            toastr.info(`已切换到${newMode ? '全局' : '聊天'}设置模式`);
        }
    });

    // 输入框事件
    const hideLastNInput = document.getElementById('hide-last-n');
    if (hideLastNInput) {
        hideLastNInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            e.target.value = isNaN(value) || value < 0 ? '' : value;
        });
    }

    // 保存设置按钮
    $('#hide-save-settings-btn').on('click', function() {
        const value = parseInt(hideLastNInput.value);
        const valueToSave = isNaN(value) || value < 0 ? 0 : value;
        const currentSettings = getCurrentHideSettings();
        const currentValue = currentSettings?.hideLastN || 0;

        if (valueToSave !== currentValue) {
            const $btn = $(this);
            $btn.text('保存中...').prop('disabled', true);

            const success = saveCurrentHideSettings(valueToSave);
            if (success) {
                runFullHideCheck();
                updateCurrentHideSettingsDisplay();
                toastr.success('隐藏设置已保存');
            }

            $btn.text('保存设置').prop('disabled', false);
        } else {
            toastr.info('设置未更改');
        }
    });

    // 全部取消隐藏按钮
    $('#hide-unhide-all-btn').on('click', unhideAllMessages);

    // 核心事件监听
    eventSource.on(event_types.CHAT_CHANGED, (data) => {
        cachedContext = null;
        $('#hide-helper-toggle').val(extension_settings[extensionName]?.enabled ? 'enabled' : 'disabled');
        updateCurrentHideSettingsDisplay();
        if (extension_settings[extensionName]?.enabled) {
            runFullHideCheckDebounced();
        }
    });

    const handleNewMessage = () => {
        if (extension_settings[extensionName]?.enabled) {
            setTimeout(() => runIncrementalHideCheck(), 100);
        }
    };
    
    eventSource.on(event_types.MESSAGE_RECEIVED, handleNewMessage);
    eventSource.on(event_types.MESSAGE_SENT, handleNewMessage);
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        if (extension_settings[extensionName]?.enabled) {
            runFullHideCheckDebounced();
        }
    });
    eventSource.on(event_types.GENERATION_ENDED, () => {
        if (extension_settings[extensionName]?.enabled) {
            runFullHideCheckDebounced();
        }
    });
}

const runFullHideCheckDebounced = debounce(runFullHideCheck, 200);

jQuery(async () => {
    const initializeExtension = () => {
        loadSettings();
        createUI();
        $('#hide-helper-toggle').val(extension_settings[extensionName]?.enabled ? 'enabled' : 'disabled');
        $('#hide-settings-type-btn').text(extension_settings[extensionName]?.useGlobalSettings ? '全局模式' : '聊天模式');
        updateCurrentHideSettingsDisplay();

        if (extension_settings[extensionName]?.enabled) {
            const initialSettings = getCurrentHideSettings();
            if(initialSettings?.userConfigured === true) {
                runFullHideCheck();
            }
        }
    };

    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined' && event_types.APP_READY) {
        eventSource.on(event_types.APP_READY, initializeExtension);
    } else {
        setTimeout(initializeExtension, 2000);
    }
});
