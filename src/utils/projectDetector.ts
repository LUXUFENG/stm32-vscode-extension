/**
 * 项目检测器
 * 自动检测 STM32 项目中的芯片型号等信息
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getChipFamily } from './chipUtils';
import { getWorkspaceFolderSafe, updateSTM32Config } from './config';

export interface DetectedProjectInfo {
    chipName?: string;
    chipFamily?: string;
    projectName?: string;
}

export class ProjectDetector {
    
    /**
     * 自动检测项目中的芯片型号
     */
    async detectChip(): Promise<DetectedProjectInfo> {
        const rootPath = getWorkspaceFolderSafe();
        if (!rootPath) {
            return {};
        }

        let info: DetectedProjectInfo = {};

        // 1. 尝试从 .ioc 文件检测 (STM32CubeMX 项目)
        info = await this.detectFromIOC(rootPath);
        if (info.chipName) {
            return info;
        }

        // 2. 尝试从 CMakeLists.txt 检测
        info = await this.detectFromCMakeLists(rootPath);
        if (info.chipName) {
            return info;
        }

        // 3. 尝试从启动文件名检测
        info = await this.detectFromStartupFile(rootPath);
        if (info.chipName) {
            return info;
        }

        // 4. 尝试从链接脚本检测
        info = await this.detectFromLinkerScript(rootPath);
        
        return info;
    }

    /**
     * 从 .ioc 文件检测芯片型号
     */
    private async detectFromIOC(rootPath: string): Promise<DetectedProjectInfo> {
        try {
            const files = fs.readdirSync(rootPath);
            const iocFile = files.find(f => f.endsWith('.ioc'));
            
            if (iocFile) {
                const content = fs.readFileSync(path.join(rootPath, iocFile), 'utf8');
                
                const mcuMatch = content.match(/Mcu\.Name=(\w+)/);
                const userNameMatch = content.match(/Mcu\.UserName=(STM32\w+)/);
                const projectNameMatch = content.match(/ProjectManager\.ProjectName=(\w+)/);
                
                if (mcuMatch || userNameMatch) {
                    const chipName = userNameMatch?.[1] || mcuMatch?.[1] || '';
                    return {
                        chipName: this.normalizeChipName(chipName),
                        chipFamily: getChipFamily(chipName),
                        projectName: projectNameMatch?.[1]
                    };
                }
            }
        } catch {
            // 忽略错误
        }
        return {};
    }

    /**
     * 从 CMakeLists.txt 检测芯片型号
     */
    private async detectFromCMakeLists(rootPath: string): Promise<DetectedProjectInfo> {
        const cmakePaths = [
            path.join(rootPath, 'CMakeLists.txt'),
            path.join(rootPath, 'cmake', 'stm32cubemx', 'CMakeLists.txt'),
        ];

        for (const cmakePath of cmakePaths) {
            try {
                if (fs.existsSync(cmakePath)) {
                    const content = fs.readFileSync(cmakePath, 'utf8');
                    
                    const patterns = [
                        /set\s*\(\s*MCU_MODEL\s+["']?(STM32\w+)["']?/i,
                        /add_compile_definitions\s*\([^)]*\b(STM32\w+x[BCDEFGHI]?)\b/i,
                        /-D(STM32\w+x[BCDEFGHI]?)\b/i,
                        /target_compile_definitions\s*\([^)]*\b(STM32\w+x[BCDEFGHI]?)\b/i,
                        /STM32_DEVICE\s*=?\s*["']?(STM32\w+)["']?/i,
                    ];

                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            const chipName = match[1];
                            return {
                                chipName: this.normalizeChipName(chipName),
                                chipFamily: getChipFamily(chipName)
                            };
                        }
                    }
                }
            } catch {
                // 忽略错误
            }
        }
        return {};
    }

    /**
     * 从启动文件名检测芯片型号
     */
    private async detectFromStartupFile(rootPath: string): Promise<DetectedProjectInfo> {
        try {
            const startupFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootPath, '**/startup_stm32*.s'),
                '**/node_modules/**',
                5
            );

            if (startupFiles.length > 0) {
                const fileName = path.basename(startupFiles[0].fsPath, '.s');
                const match = fileName.match(/startup_(stm32\w+)/i);
                if (match) {
                    const chipName = match[1].toUpperCase();
                    return {
                        chipName: this.normalizeChipName(chipName),
                        chipFamily: getChipFamily(chipName)
                    };
                }
            }
        } catch {
            // 忽略错误
        }
        return {};
    }

    /**
     * 从链接脚本检测芯片型号
     */
    private async detectFromLinkerScript(rootPath: string): Promise<DetectedProjectInfo> {
        try {
            const ldFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootPath, '**/*.ld'),
                '**/node_modules/**',
                5
            );

            for (const ldFile of ldFiles) {
                const fileName = path.basename(ldFile.fsPath, '.ld');
                const match = fileName.match(/(STM32\w+?)(?:Tx|_FLASH|_RAM)?$/i);
                if (match) {
                    const chipName = match[1].toUpperCase();
                    return {
                        chipName: this.normalizeChipName(chipName),
                        chipFamily: getChipFamily(chipName)
                    };
                }
            }
        } catch {
            // 忽略错误
        }
        return {};
    }

    /**
     * 规范化芯片名称
     */
    private normalizeChipName(name: string): string {
        return name.toUpperCase();
    }
}

/**
 * 快速选择调试器类型
 */
export async function selectDebugInterface(): Promise<string | undefined> {
    const interfaces = [
        { label: 'ST-Link', description: '官方调试器', value: 'stlink' },
        { label: 'ST-Link V2', description: 'ST-Link V2', value: 'stlink-v2' },
        { label: 'ST-Link V2-1', description: 'ST-Link V2-1 (Nucleo 板载)', value: 'stlink-v2-1' },
        { label: 'ST-Link V3', description: 'ST-Link V3', value: 'stlink-v3' },
        { label: 'J-Link', description: 'Segger J-Link', value: 'jlink' },
        { label: 'CMSIS-DAP', description: 'CMSIS-DAP 兼容调试器', value: 'cmsis-dap' },
        { label: 'DAP-Link', description: 'DAP-Link 调试器', value: 'cmsis-dap' },
    ];

    const selected = await vscode.window.showQuickPick(interfaces, {
        placeHolder: '选择调试器类型',
        title: '调试器接口'
    });

    if (selected) {
        await updateSTM32Config('debugInterface', selected.value);
        return selected.value;
    }
    return undefined;
}

/**
 * 快速选择构建类型
 */
export async function selectBuildType(): Promise<string | undefined> {
    const workspacePath = getWorkspaceFolderSafe();
    const hasCMakePresets = workspacePath && 
        fs.existsSync(path.join(workspacePath, 'CMakePresets.json'));
    
    if (hasCMakePresets) {
        try {
            await vscode.commands.executeCommand('cmake.selectConfigurePreset');
            
            // 延迟同步构建类型
            const syncAttempts = [500, 1500, 3000];
            for (const delay of syncAttempts) {
                setTimeout(async () => {
                    await syncBuildTypeFromCMakeTools();
                }, delay);
            }
            
            return undefined;
        } catch (e) {
            console.log('cmake.selectConfigurePreset failed:', e);
        }
    }
    
    const currentBuildType = vscode.workspace.getConfiguration('stm32').get<string>('buildType') || 'Debug';
    
    const buildTypes = [
        { label: '$(bug) Debug', description: '调试版本 (含调试信息，无优化)', value: 'Debug' },
        { label: '$(package) Release', description: '发布版本 (优化性能)', value: 'Release' },
        { label: '$(debug) RelWithDebInfo', description: '带调试信息的发布版本', value: 'RelWithDebInfo' },
        { label: '$(file-zip) MinSizeRel', description: '最小体积发布版本', value: 'MinSizeRel' },
    ];

    const items = buildTypes.map(bt => ({
        ...bt,
        label: bt.value === currentBuildType ? `$(check) ${bt.label}` : bt.label
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前: ${currentBuildType}`,
        title: '构建配置'
    });

    if (selected) {
        await updateSTM32Config('buildType', selected.value);
        
        try {
            const cmakeConfig = vscode.workspace.getConfiguration('cmake');
            await cmakeConfig.update('buildType', selected.value, vscode.ConfigurationTarget.Workspace);
        } catch {
            // 忽略
        }
        
        return selected.value;
    }
    return undefined;
}

/**
 * 从 CMake Tools 同步构建类型
 */
async function syncBuildTypeFromCMakeTools(): Promise<void> {
    const workspacePath = getWorkspaceFolderSafe();
    if (!workspacePath) return;

    const buildDirs = ['Debug', 'Release', 'RelWithDebInfo', 'MinSizeRel'];
    let latestDir = '';
    let latestTime = 0;

    for (const dir of buildDirs) {
        const buildPath = path.join(workspacePath, 'build', dir);
        try {
            const stats = fs.statSync(buildPath);
            if (stats.isDirectory() && stats.mtimeMs > latestTime) {
                latestTime = stats.mtimeMs;
                latestDir = dir;
            }
        } catch {
            // 目录不存在
        }
    }

    if (latestDir) {
        await updateBuildType(latestDir);
        return;
    }

    const cmakeCachePaths = [
        path.join(workspacePath, 'build', 'Debug', 'CMakeCache.txt'),
        path.join(workspacePath, 'build', 'Release', 'CMakeCache.txt'),
        path.join(workspacePath, 'build', 'CMakeCache.txt'),
    ];

    for (const cachePath of cmakeCachePaths) {
        if (fs.existsSync(cachePath)) {
            const dirName = path.basename(path.dirname(cachePath));
            if (['Debug', 'Release', 'RelWithDebInfo', 'MinSizeRel'].includes(dirName)) {
                await updateBuildType(dirName);
                return;
            }
            
            try {
                const content = fs.readFileSync(cachePath, 'utf8');
                const match = content.match(/CMAKE_BUILD_TYPE:STRING=(\w+)/);
                if (match && match[1]) {
                    await updateBuildType(match[1]);
                    return;
                }
            } catch {
                // 忽略
            }
        }
    }
}

async function updateBuildType(buildType: string): Promise<void> {
    const normalized = buildType.charAt(0).toUpperCase() + buildType.slice(1).toLowerCase();
    const validTypes = ['Debug', 'Release', 'Relwithdebinfo', 'Minsizerel'];
    const finalType = validTypes.find(t => t.toLowerCase() === normalized.toLowerCase()) || buildType;

    const current = vscode.workspace.getConfiguration('stm32').get<string>('buildType');
    
    if (current !== finalType) {
        await updateSTM32Config('buildType', finalType);
        vscode.window.setStatusBarMessage(`构建类型: ${finalType}`, 3000);
    }
}
