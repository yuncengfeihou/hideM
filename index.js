// index.js (使用 extension_settings 存储并包含自动迁移，优化了初始化)
import { extension_settings, loadExtensionSettings, getContext } from "../../../extensions.js";
// 尝试导入全局列表，路径可能需要调整！如果导入失败，迁移逻辑需要改用 API 调用
import { saveSettingsDebounced, eventSource, event_types, getRequestHeaders, characters } from "../../../../script.js";

import { groups } from "../../../group-chats.js";

const extensionName = "hide";
const defaultSettings = {
    // 全局默认设置
    enabled: true,
    // 用于存储每个实体设置的对象
    settings_by_entity: {},
    // 迁移标志
    migration_v1_complete: false,
    // 添加全局设置相关字段
    useGlobalSettings: false, // 用户偏好是否在无特定设置时使用全局设置
    globalHideSettings: {
        hideLastN: 0,
        lastProcessedLength: 0,
        userConfigured: false // 全局设置是否被用户配置过
    }
};

// 缓存上下文
let cachedContext = null;

// DOM元素缓存
const domCache = {
    hideLastNInput: null,
    saveBtn: null,
    currentValueDisplay: null,
    settingsTypeBtn: null, // 新增
    // 初始化缓存
    init() {
        console.debug(`[${extensionName} DEBUG] Initializing DOM cache.`);
        this.hideLastNInput = document.getElementById('hide-last-n');
        this.saveBtn = document.getElementById('hide-save-settings-btn');
        this.currentValueDisplay = document.getElementById('hide-current-value');
        this.settingsTypeBtn = document.getElementById('hide-settings-type-btn'); // 新增
        console.debug(`[${extensionName} DEBUG] DOM cache initialized:`, {
            hideLastNInput: !!this.hideLastNInput,
            saveBtn: !!this.saveBtn,
            currentValueDisplay: !!this.currentValueDisplay,
            settingsTypeBtn: !!this.settingsTypeBtn // 新增
        });
    }
};

// 获取优化的上下文
function getContextOptimized() {
    // console.debug(`[${extensionName} DEBUG] Entering getContextOptimized.`); // 减少冗余日志
    if (!cachedContext) {
        // console.debug(`[${extensionName} DEBUG] Context cache miss. Calling getContext().`);
        cachedContext = getContext();
        // console.debug(`[${extensionName} DEBUG] Context fetched:`, cachedContext ? `CharacterId: ${cachedContext.characterId}, GroupId: ${cachedContext.groupId}, Chat Length: ${cachedContext.chat?.length}` : 'null');
    } else {
        // console.debug(`[${extensionName} DEBUG] Context cache hit.`);
    }
    return cachedContext;
}

// 辅助函数：获取当前上下文的唯一实体ID
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
    // console.debug(`[${extensionName} DEBUG] Could not determine entityId from context.`); // 减少冗余日志
    return null;
}

// 运行数据迁移 (从旧位置到新的全局位置)
function runMigration() {
    console.log(`[${extensionName}] === 开始设置迁移过程 ===`);
    let migratedCount = 0;
    extension_settings[extensionName].settings_by_entity = extension_settings[extensionName].settings_by_entity || {};
    const settingsContainer = extension_settings[extensionName].settings_by_entity;
    console.log(`[${extensionName}] 目标设置容器已初始化/找到。`);

    // --- 迁移角色数据 ---
    console.log(`[${extensionName}] --- 开始角色设置迁移 ---`);
    if (typeof characters !== 'undefined' && Array.isArray(characters)) {
        console.log(`[${extensionName}] 全局 'characters' 数组已找到。角色数量: ${characters.length}。`);
        characters.forEach((character, index) => {
            // console.log(`[${extensionName}] 处理角色 #${index}: ${character ? character.name : '不可用'}`); // 减少日志
            if (!character || !character.data || !character.data.extensions) {
                // console.log(`[${extensionName}]   跳过角色 #${index}: 缺少角色对象、data 或 extensions 属性。`);
                return;
            }
            try {
                const oldSettingsPath = 'character.data.extensions.hideHelperSettings';
                const oldSettings = character.data.extensions.hideHelperSettings;
                if (oldSettings && typeof oldSettings === 'object' && oldSettings !== null) {
                    const hasHideLastN = typeof oldSettings.hideLastN === 'number';
                    const hasLastProcessedLength = typeof oldSettings.lastProcessedLength === 'number';
                    const isUserConfigured = oldSettings.userConfigured === true;
                    const isValidOldData = hasHideLastN || hasLastProcessedLength || isUserConfigured;
                    if (isValidOldData) {
                        const avatarFileName = character.avatar;
                        if (avatarFileName) {
                            const entityId = `character-${avatarFileName}`;
                            if (!settingsContainer.hasOwnProperty(entityId)) {
                                console.log(`[${extensionName}]   操作: 正在迁移角色 ${character.name || avatarFileName} (entityId '${entityId}') 的设置。`);
                                settingsContainer[entityId] = { ...oldSettings };
                                migratedCount++;
                            } else {
                                // console.log(`[${extensionName}]   跳过迁移: 新位置已存在 entityId '${entityId}' 的数据。`);
                            }
                        } else {
                             console.warn(`[${extensionName}]   跳过迁移: 无法迁移角色 ${character.name || '不可用'} 的设置: 缺少头像文件名。`);
                        }
                    } else {
                         // console.warn(`[${extensionName}]   跳过迁移: 角色 ${character.name || '不可用'} 的旧设置数据无效或为空。`);
                    }
                }
            } catch (charError) {
                 console.error(`[${extensionName}]   错误: 迁移索引 ${index} (名称: ${character.name || '不可用'}) 的角色设置时出错:`, charError);
            }
        });
         console.log(`[${extensionName}] --- 完成角色设置迁移 ---`);
    } else {
         console.warn(`[${extensionName}] 无法迁移角色设置: 全局 'characters' 数组不可用或不是数组。`);
    }

    // --- 迁移群组数据 ---
    console.log(`[${extensionName}] --- 开始群组设置迁移 ---`);
    if (typeof groups !== 'undefined' && Array.isArray(groups)) {
        console.log(`[${extensionName}] 全局 'groups' 数组已找到。群组数量: ${groups.length}。`);
        groups.forEach((group, index) => {
            // console.log(`[${extensionName}] 处理群组 #${index}: ${group ? group.name : '不可用'} (ID: ${group ? group.id : '不可用'})`); // 减少日志
             if (!group || !group.data) {
                // console.log(`[${extensionName}]   跳过群组 #${index}: 缺少群组对象或 data 属性。`);
                return;
            }
            try {
                const oldSettingsPath = 'group.data.hideHelperSettings';
                const oldSettings = group.data.hideHelperSettings;
                if (oldSettings && typeof oldSettings === 'object' && oldSettings !== null) {
                    const hasHideLastN = typeof oldSettings.hideLastN === 'number';
                    const hasLastProcessedLength = typeof oldSettings.lastProcessedLength === 'number';
                    const isUserConfigured = oldSettings.userConfigured === true;
                    const isValidOldData = hasHideLastN || hasLastProcessedLength || isUserConfigured;
                    if (isValidOldData) {
                        const groupId = group.id;
                        if (groupId) {
                            const entityId = `group-${groupId}`;
                            if (!settingsContainer.hasOwnProperty(entityId)) {
                                console.log(`[${extensionName}]   操作: 正在迁移群组 ${group.name || groupId} (entityId '${entityId}') 的设置。`);
                                settingsContainer[entityId] = { ...oldSettings };
                                migratedCount++;
                            } else {
                                // console.log(`[${extensionName}]   跳过迁移: 新位置已存在 entityId '${entityId}' 的数据。`);
                            }
                        } else {
                            console.warn(`[${extensionName}]   跳过迁移: 无法迁移群组 ${group.name || '不可用'} 的设置: 缺少群组 ID。`);
                        }
                    } else {
                        // console.warn(`[${extensionName}]   跳过迁移: 群组 ${group.name || '不可用'} 的旧设置数据无效或为空。`);
                    }
                }
            } catch (groupError) {
                console.error(`[${extensionName}]   错误: 迁移索引 ${index} (名称: ${group.name || '不可用'}) 的群组设置时出错:`, groupError);
            }
        });
         console.log(`[${extensionName}] --- 完成群组设置迁移 ---`);
    } else {
        console.warn(`[${extensionName}] 无法迁移群组设置: 全局 'groups' 数组不可用或不是数组。`);
    }

    if (migratedCount > 0) {
         console.log(`[${extensionName}] 迁移完成。成功将 ${migratedCount} 个实体的设置迁移到新的全局位置。`);
    } else {
         console.log(`[${extensionName}] 迁移完成。无需迁移设置。`);
    }
    extension_settings[extensionName].migration_v1_complete = true;
    saveSettingsDebounced();
    console.log(`[${extensionName}] === 迁移过程完毕 ===`);
}


// 初始化扩展设置 (包含迁移检查)
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
        globalHideSettings: { // 确保 globalHideSettings 内部字段也得到正确初始化
            ...defaultSettings.globalHideSettings, // 先用默认值填充
            ...(extension_settings[extensionName].globalHideSettings || {}) // 再用已存储的值覆盖
        }
    });

    if (!extension_settings[extensionName].migration_v1_complete) {
        console.log(`[${extensionName}] 迁移标志未找到或为 false。尝试进行迁移...`);
        try {
            runMigration();
        } catch (error) {
            console.error(`[${extensionName}] 执行迁移时发生错误:`, error);
        }
    } else {
        console.log(`[${extensionName}] 迁移标志为 true。跳过迁移。`);
    }
    console.log(`[${extensionName}] 设置已加载/初始化:`, JSON.parse(JSON.stringify(extension_settings[extensionName])));
}

function createUI() {
    console.log(`[${extensionName}] Entering createUI.`);
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
    console.log(`[${extensionName}] Exiting createUI.`);
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
                <input type="number" id="hide-last-n" min="0" placeholder="保留最近N条消息">
            </div>
            <button id="hide-unhide-all-btn" class="hide-helper-btn">取消隐藏</button>
        </div>
        <div class="hide-helper-current">
            <strong>当前生效设置:</strong> <span id="hide-current-value">无</span>
        </div>
        <div class="hide-helper-popup-footer">
            <button id="hide-settings-type-btn" class="hide-helper-btn">聊天模式</button>
            <button id="hide-helper-popup-close" class="hide-helper-close-btn">关闭</button>
            <button id="hide-helper-instructions-btn" class="hide-helper-btn">使用说明</button>
        </div>
    </div>`;
    $('body').append(popupHtml);
}

// 获取当前应该使用的隐藏设置 (根据优先级逻辑)
function getCurrentHideSettings() {
    // console.debug(`[${extensionName} DEBUG] Entering getCurrentHideSettings.`);
    const entityId = getCurrentEntityId();
    const settings = extension_settings[extensionName];

    if (!settings) {
        // console.warn(`[${extensionName} DEBUG] getCurrentHideSettings: Extension settings not found.`);
        return { ...defaultSettings.globalHideSettings, hideLastN: 0 }; // 返回一个安全的默认值
    }

    // 1. 检查特定实体设置
    if (entityId) {
        const entitySettings = settings.settings_by_entity?.[entityId];
        // 如果实体有特定配置，并且 hideLastN > 0，则优先使用它
        if (entitySettings && entitySettings.userConfigured && entitySettings.hideLastN > 0) {
            // console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Using entity-specific settings for "${entityId}" (hideLastN: ${entitySettings.hideLastN}). Precedence override.`);
            return entitySettings;
        }
    }

    // 2. 如果没有有效的特定实体设置，检查是否启用了全局设置
    if (settings.useGlobalSettings) {
        // console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Using global settings (hideLastN: ${settings.globalHideSettings?.hideLastN}).`);
        return settings.globalHideSettings || { ...defaultSettings.globalHideSettings, hideLastN: 0 };
    }

    // 3. 如果全局设置未启用，且没有特定实体设置，则尝试返回该实体的（可能是空的或hideLastN=0的）设置
    // 或者，如果连实体ID都没有，就返回一个表示“无操作”的设置
    if (entityId) {
        const entitySettings = settings.settings_by_entity?.[entityId];
        if (entitySettings && entitySettings.userConfigured) { // 即使 hideLastN 是 0，也用它，表示此聊天明确设置为“不隐藏”
            // console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: Using entity-specific settings for "${entityId}" (hideLastN: ${entitySettings.hideLastN}). Global not preferred.`);
            return entitySettings;
        }
    }
    
    // console.debug(`[${extensionName} DEBUG] getCurrentHideSettings: No specific entity setting, global not preferred or no entityId. Returning default 'no hide'.`);
    // 默认不隐藏，或返回一个代表“无配置”的状态
    return { hideLastN: 0, lastProcessedLength: 0, userConfigured: false };
}


// 保存当前隐藏设置 (到全局 extension_settings)
// hideLastN 是要保存的值
// isGlobalIntent 是一个布尔值，指示用户的意图是修改全局设置还是当前聊天设置
function saveCurrentHideSettings(hideLastN, isGlobalIntent) {
    console.log(`[${extensionName}] Entering saveCurrentHideSettings with hideLastN: ${hideLastN}, isGlobalIntent: ${isGlobalIntent}`);
    const context = getContextOptimized();
    if (!context) {
        console.error(`[${extensionName}] Cannot save settings: Context not available.`);
        return false;
    }

    const chatLength = context.chat?.length || 0;
    const settingsToSave = {
        hideLastN: hideLastN >= 0 ? hideLastN : 0,
        lastProcessedLength: chatLength,
        userConfigured: true // 只要保存，就代表用户配置过
    };

    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    if (isGlobalIntent) {
        console.log(`[${extensionName}] saveCurrentHideSettings: Saving to global settings.`);
        extension_settings[extensionName].globalHideSettings = settingsToSave;
    } else {
        const entityId = getCurrentEntityId();
        if (!entityId) {
            console.error(`[${extensionName}] Cannot save entity-specific settings: Could not determine entityId.`);
            toastr.error('无法保存聊天特定设置：无法确定当前角色或群组。');
            return false;
        }
        console.log(`[${extensionName}] saveCurrentHideSettings: Saving for entityId "${entityId}"`);
        extension_settings[extensionName].settings_by_entity = extension_settings[extensionName].settings_by_entity || {};
        extension_settings[extensionName].settings_by_entity[entityId] = settingsToSave;
    }

    saveSettingsDebounced();
    console.log(`[${extensionName}] saveSettingsDebounced() called.`);
    return true;
}

// 更新当前设置显示
function updateCurrentHideSettingsDisplay() {
    // console.debug(`[${extensionName} DEBUG] Entering updateCurrentHideSettingsDisplay.`);
    if (!domCache.currentValueDisplay || !domCache.hideLastNInput || !domCache.settingsTypeBtn) {
        domCache.init();
        if (!domCache.currentValueDisplay || !domCache.hideLastNInput || !domCache.settingsTypeBtn) {
            console.warn(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: DOM elements not found after init. Aborting.`);
            return;
        }
    }

    const effectiveSettings = getCurrentHideSettings(); // 获取根据优先级真正生效的设置
    const displayValue = (effectiveSettings && effectiveSettings.hideLastN > 0) ? effectiveSettings.hideLastN : '无';
    domCache.currentValueDisplay.textContent = displayValue;
    // console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Effective display text set to: "${displayValue}"`);

    // 更新输入框的值，根据当前是“全局模式”还是“聊天模式”按钮的状态
    const preferGlobal = extension_settings[extensionName]?.useGlobalSettings || false;
    let inputValue = '';
    if (preferGlobal) {
        const globalSettings = extension_settings[extensionName]?.globalHideSettings;
        inputValue = (globalSettings && globalSettings.hideLastN > 0) ? globalSettings.hideLastN : '';
        // console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Input field reflects global settings (value: "${inputValue}")`);
    } else {
        const entityId = getCurrentEntityId();
        const entitySettings = entityId ? extension_settings[extensionName]?.settings_by_entity?.[entityId] : null;
        inputValue = (entitySettings && entitySettings.hideLastN > 0) ? entitySettings.hideLastN : '';
        // console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Input field reflects entity-specific settings for "${entityId}" (value: "${inputValue}")`);
    }
    domCache.hideLastNInput.value = inputValue;
    
    // 更新模式切换按钮的文本
    domCache.settingsTypeBtn.textContent = preferGlobal ? '全局模式' : '聊天模式';
    // console.debug(`[${extensionName} DEBUG] updateCurrentHideSettingsDisplay: Settings type button text set to: "${preferGlobal ? '全局模式' : '聊天模式'}"`);
    
    // console.debug(`[${extensionName} DEBUG] Exiting updateCurrentHideSettingsDisplay.`);
}


// 防抖函数
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

// 显示使用说明弹窗
function showInstructions() {
    console.log(`[${extensionName}] Showing instructions popup.`);
    $('#hide-helper-instructions-popup').remove();
    const instructionsHtml = `
    <div id="hide-helper-instructions-popup" class="hide-helper-instructions-popup">
        <div class="hide-helper-instructions-header">
            <span class="hide-helper-instructions-title">隐藏助手 - 使用说明</span>
            <button id="hide-helper-instructions-close" class="hide-helper-instructions-close-btn">×</button>
        </div>
        <div class="hide-helper-instructions-content">
            <h2>核心功能：设置保留消息数量</h2>
            <p>插件的核心是允许你设置一个数字 "X"，代表希望在聊天中保留的最新消息数量。所有早于这 X 条消息的内容都将被自动隐藏。</p>
            
            <h2>操作模式：聊天特定 vs 全局优先</h2>
            <p>插件提供两种主要的设置偏好，你可以通过弹窗右下角的 <strong class="button-like">全局模式 / 聊天模式</strong> 按钮进行切换：</p>
            <ul>
                <li><strong>聊天模式 (默认和推荐):</strong>
                    <ul>
                        <li>在此模式下，你为当前角色卡或群聊设置的隐藏值 "X" 将<strong>仅绑定到该特定聊天</strong>。</li>
                        <li>你可以为每个聊天独立配置不同的 "X" 值。</li>
                        <li><strong>这是推荐的使用方式，因为它提供了最大的灵活性。</strong></li>
                    </ul>
                </li>
                <li><strong>全局模式:</strong>
                    <ul>
                        <li>在此模式下，你设置的隐藏值 "X" 将作为<strong>全局默认值</strong>。</li>
                        <li>当切换到 <strong class="button-like">全局模式</strong> 时，你输入的数字会保存为全局设置。</li>
                    </ul>
                </li>
            </ul>

            <h2>设置优先级 (重要!)</h2>
            <p>无论你当前的模式按钮是“全局模式”还是“聊天模式”，插件始终遵循以下优先级来决定实际生效的隐藏规则：</p>
            <ol>
                <li><strong>优先使用特定聊天的有效设置：</strong>如果当前的角色卡或群聊曾经在“聊天模式”下被设置过一个<strong>大于0</strong>的隐藏值 "X"，那么这个特定设置<strong>总是最优先被采用</strong>。</li>
                <li><strong>其次考虑全局设置：</strong>只有当当前聊天<strong>没有</strong>上述有效的特定设置时（即其特定隐藏值为0或从未配置），插件才会检查你是否通过 <strong class="button-like">全局模式</strong> 按钮启用了全局设置。如果启用了，并且全局设置中有一个大于0的 "X" 值，则应用该全局值。</li>
                <li><strong>默认不隐藏：</strong>如果以上两种情况都不满足，则不执行任何隐藏操作。</li>
            </ol>
            <p>弹窗中的 <strong class="button-like">当前生效设置</strong> 会显示根据此优先级计算出的、实际正在作用于当前聊天的隐藏值。</p>

            <h2>如何设置和保存</h2>
            <ol>
                <li>点击输入框旁的 <span class="icon-example"><i class="fa-solid fa-ghost"></i> 隐藏助手</span> 按钮打开设置弹窗。</li>
                <li><strong>选择保存目标：</strong>
                    <ul>
                        <li>如果你想为<strong>当前聊天</strong>设置/修改隐藏值，请确保右下角按钮显示为 <strong class="button-like">聊天模式</strong>。</li>
                        <li>如果你想设置/修改<strong>全局默认</strong>隐藏值，请点击按钮切换至 <strong class="button-like">全局模式</strong>。</li>
                    </ul>
                </li>
                <li>在 <strong class="button-like">保存设置</strong> 按钮右侧的输入框中输入数字 "X" (希望保留的最新消息数)。输入0表示不隐藏或清除当前模式下的设置。</li>
                <li>点击 <strong class="button-like">保存设置</strong>。插件会根据你第2步选择的模式，将 "X" 保存到对应的位置（特定聊天或全局）。</li>
                <li>系统会立即根据新的设置（并遵循上述优先级）来更新消息的隐藏状态。</li>
            </ol>
            <p><strong>例如：</strong></p>
            <ul>
                <li>角色A：在“聊天模式”下保存了隐藏值为 3。</li>
                <li>全局设置：在“全局模式”下保存了隐藏值为 10。</li>
                <li>当你与角色A聊天时，实际生效的是隐藏3条（因为特定聊天设置优先）。</li>
                <li>当你与角色B聊天（角色B从未在“聊天模式”下设置过隐藏值）时：
                    <ul>
                        <li>如果你的模式按钮当前是 <strong class="button-like">全局模式</strong>，则角色B会应用全局的隐藏10条。</li>
                        <li>如果你的模式按钮当前是 <strong class="button-like">聊天模式</strong>，则角色B不隐藏（因为它没有特定设置，且你未指示使用全局）。</li>
                    </ul>
                </li>
            </ul>
            
            <h2>其他功能</h2>
            <ul>
                <li><strong>取消隐藏 (<strong class="button-like">取消隐藏</strong> 按钮):</strong> 立即将当前聊天（或全局，取决于你当前的模式按钮状态）的隐藏设置改为0，并显示所有消息。这等同于在输入框输入0并保存。</li>
                <li><strong>识别隐藏消息:</strong> 被隐藏的消息上方会显示 <span class="icon-example"><i class="fa-solid fa-ghost"></i></span> 图标。</li>
                <li><strong>动态更新:</strong> 发送/接收/删除消息时，隐藏状态会自动维持。</li>
                <li><strong>AI上下文:</strong> 被隐藏的消息不会发送给AI。</li>
                <li><strong>插件开关:</strong> 可在酒馆主界面的插件管理中启用/禁用本插件。</li>
            </ul>

            <h2>问题与反馈</h2>
            <p>遇到问题或有建议，欢迎反馈！</p>
        </div>
    </div>`;
    $('body').append(instructionsHtml);
    const $popup = $('#hide-helper-instructions-popup');
    $popup.css({
        'display': 'flex', 'visibility': 'visible', 'position': 'fixed',
        'left': '50%', 'top': '10vh', // 调整位置
        'transform': 'translateX(-50%)', 'max-height': '80vh', 'z-index': '10001' // 确保在最前
    }).draggable({ handle: ".hide-helper-instructions-header" }); // 可拖动

    $('#hide-helper-instructions-close').on('click', function() {
        $popup.remove();
    });
    console.log(`[${extensionName}] Instructions popup displayed.`);
}


const runFullHideCheckDebounced = debounce(runFullHideCheck, 200);

function shouldProcessHiding() {
    // console.debug(`[${extensionName} DEBUG] Entering shouldProcessHiding.`);
    if (!extension_settings[extensionName]?.enabled) {
        // console.debug(`[${extensionName} DEBUG] shouldProcessHiding: Plugin is disabled globally. Returning false.`);
        return false;
    }

    const settings = getCurrentHideSettings(); // 使用新的优先级逻辑
    // console.debug(`[${extensionName} DEBUG] shouldProcessHiding: Effective settings for current entity:`, settings);
    // 只要 hideLastN > 0 就意味着需要处理，userConfigured 由 getCurrentHideSettings 内部逻辑间接判断
    if (!settings || settings.hideLastN <= 0) { 
        // console.debug(`[${extensionName} DEBUG] shouldProcessHiding: No effective hiding configured (hideLastN <= 0). Returning false.`);
        return false;
    }
    // console.debug(`[${extensionName} DEBUG] shouldProcessHiding: Plugin enabled and effective hiding configured. Returning true.`);
    return true;
}

async function runIncrementalHideCheck() {
    // console.debug(`[${extensionName} DEBUG] Entering runIncrementalHideCheck.`);
    if (!shouldProcessHiding()) {
        // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: shouldProcessHiding returned false. Skipping.`);
        return;
    }

    const startTime = performance.now();
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`[${extensionName} DEBUG] runIncrementalHideCheck: Aborted. Context or chat data not available.`);
        return;
    }

    const chat = context.chat;
    const currentChatLength = chat.length;
    const settings = getCurrentHideSettings(); // 获取当前生效的设置
    // 如果 settings 为 null 或 undefined，则设置默认值以防止错误
    const { hideLastN = 0, lastProcessedLength = 0, userConfigured = false } = settings || {};


    // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: currentChatLength=${currentChatLength}, effective hideLastN=${hideLastN}, lastProcessedLength=${lastProcessedLength}`);

    if (currentChatLength === 0 || hideLastN <= 0) {
        // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: No messages or no hiding. Checking if length needs saving.`);
        // 只有当hideLastN > 0的设置被用户主动修改为0时，才需要保存。
        // 或者，如果之前有隐藏，现在没有了，也需要保存长度。
        // 这个逻辑有点复杂，暂时简化：如果长度变了，并且是用户配置过的，就更新长度。
        // 这里的 userConfigured 来自 getCurrentHideSettings，它可能是实体或全局的。
        // 我们需要知道这个 hideLastN=0 的结果是来自哪个配置。
        // 简化：保存操作主要由用户点击保存按钮或取消隐藏按钮触发。这里的自动保存长度可以更保守。
        const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
        const targetSettings = preferGlobal 
            ? extension_settings[extensionName]?.globalHideSettings 
            : (getCurrentEntityId() ? extension_settings[extensionName]?.settings_by_entity?.[getCurrentEntityId()] : null);

        if (targetSettings && targetSettings.userConfigured && currentChatLength !== targetSettings.lastProcessedLength) {
            // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Length changed. Saving settings for the current mode.`);
            saveCurrentHideSettings(targetSettings.hideLastN, preferGlobal); // 保存当前模式下的设置
        }
        return;
    }

    if (currentChatLength <= lastProcessedLength) {
        // console.warn(`[${extensionName} DEBUG] runIncrementalHideCheck: Skipped. Chat length did not increase or decreased.`);
         if (currentChatLength < lastProcessedLength) { // 消息被删除了
            const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
            const targetSettings = preferGlobal 
                ? extension_settings[extensionName]?.globalHideSettings 
                : (getCurrentEntityId() ? extension_settings[extensionName]?.settings_by_entity?.[getCurrentEntityId()] : null);
            if (targetSettings && targetSettings.userConfigured) {
                // console.warn(`[${extensionName} DEBUG] runIncrementalHideCheck: Chat length decreased. Saving settings with new length for the current mode.`);
                saveCurrentHideSettings(targetSettings.hideLastN, preferGlobal);
            }
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
            console.log(`[${extensionName}] Incrementally hiding messages: Indices [${toHideIncrementally.join(', ')}]`);
            toHideIncrementally.forEach(idx => { if (chat[idx]) chat[idx].is_system = true; });
            try {
                const hideSelector = toHideIncrementally.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) $(hideSelector).attr('is_system', 'true');
            } catch (error) {
                console.error(`[${extensionName}] Error updating DOM incrementally:`, error);
            }
            
            // 保存到当前用户选择的模式（全局或聊天）
            const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
            saveCurrentHideSettings(hideLastN, preferGlobal);
        } else {
             // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: No messages needed hiding incrementally.`);
             // 即使没有隐藏，如果长度变了，也更新一下对应模式的 lastProcessedLength
            const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
            const targetSettings = preferGlobal 
                ? extension_settings[extensionName]?.globalHideSettings 
                : (getCurrentEntityId() ? extension_settings[extensionName]?.settings_by_entity?.[getCurrentEntityId()] : null);
            if (targetSettings && targetSettings.userConfigured && targetSettings.lastProcessedLength !== currentChatLength) {
                saveCurrentHideSettings(hideLastN, preferGlobal);
            }
        }
    } else {
        // console.debug(`[${extensionName} DEBUG] runIncrementalHideCheck: Visible start did not advance.`);
        // 长度可能变了，但可见起始点没变 (例如，hideLastN 很大)
        const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
        const targetSettings = preferGlobal 
            ? extension_settings[extensionName]?.globalHideSettings 
            : (getCurrentEntityId() ? extension_settings[extensionName]?.settings_by_entity?.[getCurrentEntityId()] : null);
        if (targetSettings && targetSettings.userConfigured && targetSettings.lastProcessedLength !== currentChatLength) {
            saveCurrentHideSettings(hideLastN, preferGlobal);
        }
    }
    // console.debug(`[${extensionName} DEBUG] Incremental check completed in ${performance.now() - startTime}ms`);
}

async function runFullHideCheck() {
    console.log(`[${extensionName}] Entering runFullHideCheck.`);
    if (!shouldProcessHiding()) {
        // console.log(`[${extensionName}] runFullHideCheck: shouldProcessHiding returned false. Skipping.`);
        // 即使不处理隐藏，如果之前有设置但现在hideLastN=0，也需要确保所有消息都显示
        const context = getContextOptimized();
        if (!context || !context.chat) return;

        let changed = false;
        for (let i = 0; i < context.chat.length; i++) {
            if (context.chat[i] && context.chat[i].is_system === true) {
                context.chat[i].is_system = false;
                changed = true;
                 $(`.mes[mesid="${i}"]`).attr('is_system', 'false');
            }
        }
        if (changed) console.log(`[${extensionName}] runFullHideCheck: Ensured all messages are shown as no hiding is active.`);
        
        // 更新一下对应模式的 lastProcessedLength
        const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
        const effectiveSettings = getCurrentHideSettings(); // 当前生效的，可能是0
        const targetSettings = preferGlobal
            ? extension_settings[extensionName]?.globalHideSettings
            : (getCurrentEntityId() ? extension_settings[extensionName]?.settings_by_entity?.[getCurrentEntityId()] : null);
        
        if (targetSettings && targetSettings.userConfigured && targetSettings.lastProcessedLength !== context.chat.length) {
            saveCurrentHideSettings(targetSettings.hideLastN, preferGlobal); // 保存当前模式（可能是0）
        }
        return;
    }

    const startTime = performance.now();
    const context = getContextOptimized();
    if (!context || !context.chat) {
        console.warn(`[${extensionName}] runFullHideCheck: Aborted. Context or chat data not available.`);
        return;
    }
    const chat = context.chat;
    const currentChatLength = chat.length;
    // console.log(`[${extensionName}] runFullHideCheck: Context OK. Chat length: ${currentChatLength}`);

    const settings = getCurrentHideSettings(); // 获取当前生效的设置
    const { hideLastN } = settings; // userConfigured 在 settings 内部
    // console.log(`[${extensionName}] runFullHideCheck: Effective settings: hideLastN=${hideLastN}`);

    const visibleStart = Math.max(0, currentChatLength - hideLastN);
    // console.log(`[${extensionName}] runFullHideCheck: Calculated visibleStart index: ${visibleStart}`);

    const toHide = [];
    const toShow = [];
    let changed = false;
    for (let i = 0; i < currentChatLength; i++) {
        const msg = chat[i];
        if (!msg) continue;
        const isCurrentlyHidden = msg.is_system === true;
        const shouldBeHidden = i < visibleStart;

        if (shouldBeHidden && !isCurrentlyHidden) {
            msg.is_system = true;
            toHide.push(i);
            changed = true;
        } else if (!shouldBeHidden && isCurrentlyHidden) {
            msg.is_system = false;
            toShow.push(i);
            changed = true;
        }
    }
    // console.log(`[${extensionName}] runFullHideCheck: Diff calculation done. Changes: ${changed}. To hide: ${toHide.length}, To show: ${toShow.length}.`);

    if (changed) {
        try {
            if (toHide.length > 0) {
                const hideSelector = toHide.map(id => `.mes[mesid="${id}"]`).join(',');
                if (hideSelector) $(hideSelector).attr('is_system', 'true');
            }
            if (toShow.length > 0) {
                const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
                if (showSelector) $(showSelector).attr('is_system', 'false');
            }
        } catch (error) {
            console.error(`[${extensionName}] Error updating DOM in full check:`, error);
        }
    }

    // 保存到当前用户选择的模式（全局或聊天）对应的设置中
    // 这里的 hideLastN 是 getCurrentHideSettings() 得到的实际生效值
    // 但保存时，应该保存的是用户在输入框里为特定模式（全局/聊天）设定的值
    // 因此，这里的保存逻辑应该基于用户当前的 "settings type" 按钮状态
    const preferGlobal = extension_settings[extensionName]?.useGlobalSettings;
    const settingsForSavingMode = preferGlobal 
        ? extension_settings[extensionName].globalHideSettings 
        : (getCurrentEntityId() ? extension_settings[extensionName].settings_by_entity?.[getCurrentEntityId()] : null);

    // 只有当对应模式的配置存在且其 lastProcessedLength 与当前不一致时才保存
    if (settingsForSavingMode && settingsForSavingMode.userConfigured && settingsForSavingMode.lastProcessedLength !== currentChatLength) {
        // console.log(`[${extensionName}] runFullHideCheck: Length changed for ${preferGlobal ? 'global' : 'entity'} mode. Saving.`);
        saveCurrentHideSettings(settingsForSavingMode.hideLastN, preferGlobal);
    }
    // console.log(`[${extensionName}] Full check completed in ${performance.now() - startTime}ms`);
}

async function unhideAllMessages() {
    const startTime = performance.now();
    console.log(`[${extensionName}] Entering unhideAllMessages.`);
    
    // “取消隐藏”按钮的行为应该与“保存设置”按钮类似，作用于当前选择的模式
    const preferGlobal = extension_settings[extensionName]?.useGlobalSettings || false;

    const context = getContextOptimized();
    if (context && context.chat) {
        const chat = context.chat;
        const toShow = [];
        for (let i = 0; i < chat.length; i++) {
            if (chat[i] && chat[i].is_system === true) {
                toShow.push(i);
            }
        }
        if (toShow.length > 0) {
            toShow.forEach(idx => { if (chat[idx]) chat[idx].is_system = false; });
            try {
                const showSelector = toShow.map(id => `.mes[mesid="${id}"]`).join(',');
                if (showSelector) $(showSelector).attr('is_system', 'false');
            } catch (error) {
                console.error(`[${extensionName}] Error updating DOM when unhiding all:`, error);
            }
        } else {
            console.log(`[${extensionName}] Unhide all: No hidden messages found.`);
        }
    } else {
         console.warn(`[${extensionName}] Unhide all: Chat data not available. Will only reset settings.`);
    }

    console.log(`[${extensionName}] Unhide all: Saving hide setting as 0 for ${preferGlobal ? 'global' : 'current entity'} mode.`);
    const success = saveCurrentHideSettings(0, preferGlobal); // 保存 0 到当前选择的模式
    
    if (success) {
        toastr.success(`已为${preferGlobal ? '全局' : '当前聊天'}模式取消隐藏设置`);
        updateCurrentHideSettingsDisplay(); // 更新显示，包括输入框
        runFullHideCheck(); // 确保界面刷新
    } else {
        toastr.error('取消隐藏时保存设置失败');
    }
    // console.log(`[${extensionName}] Unhide all completed in ${performance.now() - startTime}ms`);
}

function setupEventListeners() {
    console.log(`[${extensionName}] Entering setupEventListeners.`);

    $('#hide-helper-wand-button').on('click', function() {
        if (!extension_settings[extensionName]?.enabled) {
            toastr.warning('隐藏助手当前已禁用，请在扩展设置中启用。');
            return;
        }
        updateCurrentHideSettingsDisplay(); // 打开时刷新显示
        const $popup = $('#hide-helper-popup');
        $popup.css({
            'display': 'block', 'visibility': 'hidden', 'position': 'fixed',
            'left': '50%', 'transform': 'translateX(-50%)', 'z-index': '10000' // 确保在最前
        }).draggable({ handle: ".hide-helper-popup-title" }); // 使弹窗可拖动

        setTimeout(() => {
            const popupHeight = $popup.outerHeight();
            const windowHeight = $(window).height();
            const topPosition = Math.max(10, Math.min((windowHeight - popupHeight) / 2, windowHeight - popupHeight - 50));
            $popup.css({ 'top': topPosition + 'px', 'visibility': 'visible' });
        }, 0);
    });

    $('#hide-helper-popup-close').on('click', function() {
        $('#hide-helper-popup').hide();
    });

    $('#hide-helper-instructions-btn').on('click', function() {
        showInstructions();
    });

    $('#hide-helper-toggle').on('change', function() {
        const isEnabled = $(this).val() === 'enabled';
        if (extension_settings[extensionName]) {
            extension_settings[extensionName].enabled = isEnabled;
            saveSettingsDebounced();
        }
        if (isEnabled) {
            toastr.success('隐藏助手已启用');
            runFullHideCheckDebounced();
        } else {
            toastr.warning('隐藏助手已禁用');
            // 如果禁用，确保所有消息都显示
            const context = getContextOptimized();
            if (context && context.chat) {
                context.chat.forEach((msg, i) => {
                    if (msg.is_system) msg.is_system = false;
                    $(`.mes[mesid="${i}"]`).attr('is_system', 'false');
                });
            }
        }
    });

    // 模式切换按钮
    $('#hide-settings-type-btn').on('click', function() {
        const currentPreference = extension_settings[extensionName]?.useGlobalSettings || false;
        const newPreference = !currentPreference;
        
        if (extension_settings[extensionName]) {
            extension_settings[extensionName].useGlobalSettings = newPreference;
            saveSettingsDebounced(); // 保存用户偏好
            
            updateCurrentHideSettingsDisplay(); // 更新弹窗内的所有相关显示
            runFullHideCheckDebounced(); // 根据新偏好和优先级重新检查隐藏
            
            toastr.info(`保存目标已切换到: ${newPreference ? '全局模式' : '聊天模式'}`);
        }
    });

    const hideLastNInput = document.getElementById('hide-last-n');
    if (hideLastNInput) {
        hideLastNInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (isNaN(value) || value < 0) {
                 e.target.value = '';
            } else {
                 e.target.value = value;
            }
        });
    }

    // 保存设置按钮
    $('#hide-save-settings-btn').on('click', function() {
        const value = parseInt(hideLastNInput.value);
        const valueToSave = isNaN(value) || value < 0 ? 0 : value;
        
        const preferGlobal = extension_settings[extensionName]?.useGlobalSettings || false;

        // 检查是否真的改变了对应模式的设置
        let currentValueInMode;
        if (preferGlobal) {
            currentValueInMode = extension_settings[extensionName]?.globalHideSettings?.hideLastN || 0;
        } else {
            const entityId = getCurrentEntityId();
            currentValueInMode = entityId ? (extension_settings[extensionName]?.settings_by_entity?.[entityId]?.hideLastN || 0) : 0;
        }

        if (valueToSave !== currentValueInMode) {
            const $btn = $(this);
            const originalText = $btn.text();
            $btn.text('保存中...').prop('disabled', true);

            // saveCurrentHideSettings 第二个参数指明是保存到全局还是实体
            const success = saveCurrentHideSettings(valueToSave, preferGlobal); 

            if (success) {
                runFullHideCheck(); // 直接运行检查以立即应用
                updateCurrentHideSettingsDisplay(); // 更新显示
                toastr.success(`设置已保存到${preferGlobal ? '全局' : '当前聊天'}`);
            } else {
                 // saveCurrentHideSettings 内部已有 toastr.error
            }
            $btn.text(originalText).prop('disabled', false);
        } else {
            toastr.info(`设置未更改 (${preferGlobal ? '全局' : '当前聊天'}模式)`);
        }
    });

    $('#hide-unhide-all-btn').on('click', async function() {
        await unhideAllMessages();
    });

    eventSource.on(event_types.CHAT_CHANGED, (data) => {
        // console.log(`[${extensionName}] Event received: ${event_types.CHAT_CHANGED}`);
        cachedContext = null; // 清除上下文缓存
        // getContextOptimized(); // 预热缓存
        
        $('#hide-helper-toggle').val(extension_settings[extensionName]?.enabled ? 'enabled' : 'disabled');
        updateCurrentHideSettingsDisplay(); // 聊天切换时，弹窗内的所有显示都需要根据新聊天更新

        if (extension_settings[extensionName]?.enabled) {
            runFullHideCheckDebounced();
        }
    });

    const handleNewMessage = (eventType) => {
        // console.debug(`[${extensionName} DEBUG] Event received: ${eventType}`);
        if (extension_settings[extensionName]?.enabled) {
            setTimeout(() => runIncrementalHideCheck(), 100); // 给点时间让DOM更新
        }
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, () => handleNewMessage(event_types.MESSAGE_RECEIVED));
    eventSource.on(event_types.MESSAGE_SENT, () => handleNewMessage(event_types.MESSAGE_SENT));

    eventSource.on(event_types.MESSAGE_DELETED, () => {
        // console.log(`[${extensionName}] Event received: ${event_types.MESSAGE_DELETED}`);
        if (extension_settings[extensionName]?.enabled) {
            runFullHideCheckDebounced();
        }
    });

    const streamEndEvent = event_types.GENERATION_ENDED;
    eventSource.on(streamEndEvent, () => {
        //  console.log(`[${extensionName}] Event received: ${streamEndEvent}`);
         if (extension_settings[extensionName]?.enabled) {
            runFullHideCheckDebounced();
        }
    });

    console.log(`[${extensionName}] Exiting setupEventListeners.`);
}

jQuery(async () => {
    console.log(`[${extensionName}] Initializing extension...`);
    let isInitialized = false;

    const initializeExtension = () => {
        if (isInitialized) return;
        isInitialized = true;
        console.log(`[${extensionName}] Running initialization tasks.`);

        loadSettings();
        createUI(); // UI创建依赖设置加载完成

        // 初始化UI状态
        $('#hide-helper-toggle').val(extension_settings[extensionName]?.enabled ? 'enabled' : 'disabled');
        // updateCurrentHideSettingsDisplay 会处理 settingsTypeBtn 和 输入框
        // 在这里直接调用一次，以确保即使弹窗未打开，按钮文本也是对的
        // 但 domCache 可能还未完全初始化，所以依赖 createUI 里的 setTimeout 和 chat_changed 事件
        // 稳妥起见，初次加载时的显示更新最好放在 chat_changed 或延迟确保 domCache.init() 完成

        if (extension_settings[extensionName]?.enabled) {
            // 初始加载不一定立即有聊天上下文，等CHAT_CHANGED事件触发更稳妥
            // 但如果已有聊天，可以尝试运行一次
            // runFullHideCheckDebounced(); // 延迟执行，等待上下文就绪
            // console.log(`[${extensionName}] Initial full check scheduled (if applicable).`);
        }
        console.log(`[${extensionName}] Initialization tasks completed.`);
    };

    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined' && event_types.APP_READY) {
        eventSource.on(event_types.APP_READY, initializeExtension);
    } else {
        console.error(`[${extensionName}] APP_READY event not available. Using fallback timeout for initialization.`);
        setTimeout(initializeExtension, 2000);
    }
});
