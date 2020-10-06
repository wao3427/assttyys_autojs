module.exports = [
    {
        categoryName: '自动停止配置',
        itemData: [
            {
                itemName: '自动停止时间下界(单位min)',
                fieldName: 'auto_stop_lower_bound',
                fieldType: 'integer',
                default: 60,
            },
            {
                itemName: '自动停止时间上界(单位min,-1为不自动停止)',
                fieldName: 'auto_stop_upper_bound',
                fieldType: 'integer',
                default: -1,
            }
        ]
    },
    {
        categoryName: '通用配置',
        itemData: [
            {
                itemName: '模拟点击方式',
                fieldName: 'tapType',
                fieldType: 'select',
                dataList: ['无障碍', 'RootAutomator', 'Shell', '普通Root'],
            },
            {
                itemName: '坐标反转',
                fieldName: 'dirctionReverse',
                fieldType: 'boolean',
                default: false,
            },
            {
                itemName: '循环延时',
                fieldName: 'loopDelay',
                fieldType: 'integer',
                default: 200
            },
            {
                itemName: '点击后延时',
                fieldName: 'afterClickDelay',
                fieldType: 'integer',
                default: 200
            },
            {
                itemName: '点击后延时随机数',
                fieldName: 'afterClickDelayRandom',
                fieldType: 'integer',
                default: 200
            },
            {
                itemName: '定点判断颜色相似度',
                fieldName: 'colorSimilar',
                fieldType: 'integer',
                default: 15
            },
            {
                itemName: '连续执行相同功能停止脚本的次数',
                fieldName: 'continuityTimeToStop',
                fieldType: 'integer',
                default: 20
            },
            {
                itemName: '多点找色相似度',
                fieldName: 'multiColorSimilar',
                fieldType: 'integer',
                default: 4
            }
        ]
    }
];

/**
loopDelay: 200, // 循环延时
afterClickDelay: 200, // 点击后延时
afterClickDelayRandom: 200, // 点击后延时随机数
colorSimilar: 15, // 颜色相似度(比较时三个点的颜色差之和小于该值时表示相等))
continuityTimeToStop: 20, // 连续执行20次相同功能后停止脚本, 有可能一个功能会被连续执行多次，这个值不宜过低，比如说退出结算，容易连续执行8次左右
multiColorSimilar: 4, // 多点找色相似度
 */