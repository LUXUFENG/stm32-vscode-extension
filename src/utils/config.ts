/**
 * STM32 扩展配置管理
 * 统一管理所有配置的读取和更新
 */

import * as vscode from 'vscode';

/**
 * STM32 扩展配置接口
 */
export interface STM32Config {
    // 工具链配置
    toolchainPath: string;
    openocdPath: string;
    openocdScriptsPath: string;
    cmakePath: string;
    
    // 项目配置
    selectedChip: string;
    debugInterface: string;
    buildType: string;
    buildDirectory: string;
    
    // 文件配置
    elfFile: string;
    svdFile: string;
}

/**
 * 获取完整的 STM32 配置
 */
export function getSTM32Config(): STM32Config {
    const config = vscode.workspace.getConfiguration('stm32');
    
    return {
        toolchainPath: config.get<string>('toolchainPath') || '',
        openocdPath: config.get<string>('openocdPath') || 'openocd',
        openocdScriptsPath: config.get<string>('openocdScriptsPath') || '',
        cmakePath: config.get<string>('cmakePath') || 'cmake',
        selectedChip: config.get<string>('selectedChip') || '',
        debugInterface: config.get<string>('debugInterface') || 'stlink',
        buildType: config.get<string>('buildType') || 'Debug',
        buildDirectory: config.get<string>('buildDirectory') || 'build',
        elfFile: config.get<string>('elfFile') || '',
        svdFile: config.get<string>('svdFile') || ''
    };
}

/**
 * 更新 STM32 配置项
 * @param key 配置键名
 * @param value 配置值
 * @param target 配置目标（全局或工作区）
 */
export async function updateSTM32Config(
    key: keyof STM32Config,
    value: string,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
): Promise<void> {
    const config = vscode.workspace.getConfiguration('stm32');
    await config.update(key, value, target);
}

/**
 * 批量更新 STM32 配置
 * @param updates 配置更新对象
 * @param target 配置目标
 */
export async function updateSTM32ConfigBatch(
    updates: Partial<STM32Config>,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
): Promise<void> {
    const config = vscode.workspace.getConfiguration('stm32');
    
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            await config.update(key, value, target);
        }
    }
}

/**
 * 获取工作区根目录
 * @throws Error 如果没有打开工作区
 */
export function getWorkspaceFolder(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error('没有打开工作区文件夹');
    }
    return folders[0].uri.fsPath;
}

/**
 * 安全获取工作区根目录
 * @returns 工作区路径或 undefined
 */
export function getWorkspaceFolderSafe(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
}
