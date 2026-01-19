/**
 * STM32 芯片相关的公共工具函数
 * 统一管理芯片系列判断、OpenOCD 目标配置等
 */

/**
 * 根据芯片名称获取 OpenOCD target 配置文件名
 * @param chipName 芯片名称，如 "STM32F103C8"
 * @returns OpenOCD target 名称，如 "stm32f1x"
 */
export function getOpenOCDTarget(chipName: string): string {
    const chip = chipName.toLowerCase();
    
    if (chip.startsWith('stm32f0')) return 'stm32f0x';
    if (chip.startsWith('stm32f1')) return 'stm32f1x';
    if (chip.startsWith('stm32f2')) return 'stm32f2x';
    if (chip.startsWith('stm32f3')) return 'stm32f3x';
    if (chip.startsWith('stm32f4')) return 'stm32f4x';
    if (chip.startsWith('stm32f7')) return 'stm32f7x';
    if (chip.startsWith('stm32g0')) return 'stm32g0x';
    if (chip.startsWith('stm32g4')) return 'stm32g4x';
    if (chip.startsWith('stm32h7')) return 'stm32h7x';
    if (chip.startsWith('stm32l0')) return 'stm32l0';
    if (chip.startsWith('stm32l1')) return 'stm32l1';
    if (chip.startsWith('stm32l4')) return 'stm32l4x';
    if (chip.startsWith('stm32l5')) return 'stm32l5x';
    if (chip.startsWith('stm32u5')) return 'stm32u5x';
    if (chip.startsWith('stm32wb')) return 'stm32wbx';
    if (chip.startsWith('stm32wl')) return 'stm32wlx';
    
    return 'stm32f1x'; // 默认
}

/**
 * 根据芯片名称获取芯片系列
 * @param chipName 芯片名称
 * @returns 芯片系列，如 "STM32F1"
 */
export function getChipFamily(chipName: string): string {
    const name = chipName.toUpperCase();
    
    if (name.startsWith('STM32F0')) return 'STM32F0';
    if (name.startsWith('STM32F1')) return 'STM32F1';
    if (name.startsWith('STM32F2')) return 'STM32F2';
    if (name.startsWith('STM32F3')) return 'STM32F3';
    if (name.startsWith('STM32F4')) return 'STM32F4';
    if (name.startsWith('STM32F7')) return 'STM32F7';
    if (name.startsWith('STM32G0')) return 'STM32G0';
    if (name.startsWith('STM32G4')) return 'STM32G4';
    if (name.startsWith('STM32H7')) return 'STM32H7';
    if (name.startsWith('STM32L0')) return 'STM32L0';
    if (name.startsWith('STM32L1')) return 'STM32L1';
    if (name.startsWith('STM32L4')) return 'STM32L4';
    if (name.startsWith('STM32L5')) return 'STM32L5';
    if (name.startsWith('STM32U5')) return 'STM32U5';
    if (name.startsWith('STM32WB')) return 'STM32WB';
    if (name.startsWith('STM32WL')) return 'STM32WL';
    
    return '';
}

/**
 * 调试器接口类型
 */
export type DebugInterface = 'stlink' | 'stlink-v2' | 'stlink-v2-1' | 'stlink-v3' | 'jlink' | 'cmsis-dap';

/**
 * 根据调试器类型获取 OpenOCD 接口配置文件
 * @param debugInterface 调试器类型
 * @returns OpenOCD 接口配置文件路径
 */
export function getInterfaceConfig(debugInterface: string): string {
    switch (debugInterface) {
        case 'stlink':
        case 'stlink-v2':
            return 'interface/stlink-v2.cfg';
        case 'stlink-v2-1':
            return 'interface/stlink-v2-1.cfg';
        case 'stlink-v3':
            return 'interface/stlink.cfg';
        case 'jlink':
            return 'interface/jlink.cfg';
        case 'cmsis-dap':
            return 'interface/cmsis-dap.cfg';
        default:
            return 'interface/stlink.cfg';
    }
}

/**
 * 调试器显示名称映射
 */
export const DEBUGGER_NAMES: Record<string, string> = {
    'stlink': 'ST-Link',
    'stlink-v2': 'ST-Link V2',
    'stlink-v2-1': 'ST-Link V2-1',
    'stlink-v3': 'ST-Link V3',
    'jlink': 'J-Link',
    'cmsis-dap': 'CMSIS-DAP'
};

/**
 * 获取 Flash 起始地址
 * @param chipName 芯片名称
 * @returns Flash 起始地址（十六进制字符串）
 */
export function getFlashAddress(chipName: string): string {
    // 大部分 STM32 的 Flash 起始地址都是 0x08000000
    return '0x08000000';
}

/**
 * 给包含空格的路径加上引号
 * @param p 路径字符串
 * @returns 处理后的路径
 */
export function quotePath(p: string): string {
    if (p.includes('"')) {
        return p;
    }
    if (p.includes(' ') && !p.startsWith('"') && !p.startsWith("'")) {
        return `"${p}"`;
    }
    return p;
}

/**
 * 将 Windows 路径转换为正斜杠格式（OpenOCD 需要）
 * @param p 路径字符串
 * @returns 转换后的路径
 */
export function toForwardSlash(p: string): string {
    return p.replace(/\\/g, '/');
}
