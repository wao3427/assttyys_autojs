import store from '@/system/store';
import funcList from '@/common/funcList';
import defaultSchemeList from '@/common/schemeList';
import helperBridge from '@/system/helperBridge';
import multiColor from '@/common/multiColors';
import ocr from '@/system/ocr';
import { setCurrentScheme } from '@/common/tool';
import { getWidthPixels, getHeightPixels } from "@auto.pro/core";
import _ from 'lodash';
import schemeDialog from './schemeDialog';
import drawFloaty from '@/system/drawFloaty';

/**
 * 脚本对象，一个程序只能有一个
 */
var script = {
    runThread: null, // 脚本运行线程
    runCallback: null, // 运行后回调，一般用于修改悬浮样式
    stopCallback: null, // 停止后回调，异常停止、手动停止，在停止后都会调用
    scheme: null, // 运行的方案
    funcMap: null, // funcList的Map形式，下标为id，值为对应的fun元素
    multiColor: null, // 多点找色用的，提前初始化，减轻运行中计算量
    hasRedList: false, // KeepScreen(true)时会初始化redList，如果没有初始化的话这个值为false，方便在有需要的时候初始化redlist且不重复初始化
    runDate: null, // 运行启动时间
    ocr: null, // 浩然的OCR
    // 获取ocr对象，重复调用仅在第一次进行实例化
    getOcr() {
        if (!this.ocr) {
            this.ocr = ocr();
        }
        return this.ocr;
    },

    /**
     * 运行次数，下标为funcList中的id，值为这个func成功执行的次数；
     * 成功执行：多点比色成功或operatorFun返回为true
     */
    runTimes: {},
    lastFunc: null, // 最后执行成功的funcId
    global: null, // 每次启动重置为空对象，用于功能里面存变量

    // 设备信息
    device: {
        width: getWidthPixels(),
        height: getHeightPixels()
    },

    /**
     * 截图，mode为true时表示对红色通过作为下标进行初始化，但执行需要一定时间，
     * 对截图进行一次初始化后可大幅提高多点找色效率，通常初始化一次红色通道后进行多次多点找色
     * 仅使用多点比色时mode给false或不传
     * @param {Boolean} mode 
     */
    keepScreen(mode) {
        helperBridge.helper.KeepScreen(mode || false);
        if (mode) {
            this.hasRedList = true;
        } else {
            this.hasRedList = false;
        }
    },

    /**
     * 初始化红色通道
     */
    initRedList() {
        if (!this.hasRedList) {
            helperBridge.helper.GetRedList();
            this.hasRedList = true;
        }
    },

    /**
     * 设置启动后回调
     * @param {Function} callback 
     */
    setRunCallback(callback) {
        this.runCallback = callback;
    },

    /**
     * 设置停止后回调
     * @param {Function} callback 
     */
    setStopCallback(callback) {
        this.stopCallback = callback;
    },

    /**
     * 根据scheme获取Funclist，Funclist中desc和oper相关坐标根据开发分辨率自动转换成运行分辨率
     * @param {Scheme} scheme 
     * @returns 
     */
    getFuncList(scheme) {
        let retFunclist = [];
        if (!this.funcMap) {
            this.funcMap = {};
            funcList.forEach(item => this.funcMap[item.id] = item);
        }
        for (let i = 0; i < scheme.list.length; i++) {
            let thisFuncList = this.funcMap[scheme.list[i]];
            let operator = thisFuncList.operator;
            if (!thisFuncList.transed && operator) {
                for (let k = 0; k < operator.length; k++) {
                    if (operator[k].desc) {
                        operator[k].desc = helperBridge.helper.GetCmpColorArray(operator[k].desc[0], operator[k].desc[1], operator[k].desc[2]);
                    }
                    if (operator[k].oper) {
                        operator[k].oper = helperBridge.regionClickTrans(operator[k].oper);
                    }
                    if (operator[k].operStepRandom) {
                        for (let m = 0; m < operator[k].operStepRandom.length; m++) {
                            operator[k].operStepRandom[m] = helperBridge.regionClickTrans(operator[k].operStepRandom[m]);
                        }
                    }
                }
                thisFuncList.transed = true;
            }
            retFunclist.push(thisFuncList);
        }
        return retFunclist;
    },
    
    /**
     * 将funcList中operator里面的desc和oper转换为适用当前正在分辨率的坐标
     */
    initFuncList() {
        this.scheme = store.get('currentScheme', null);
        if (null === this.scheme) return;
        this.scheme.funcList = this.getFuncList(this.scheme);
    },

    /**
     * 根据 src\common\multiColors.js 初始化多点找色数组，相关坐标根据开发分辨率自动转换成运行分辨率
     */
    initMultiColor() {
        let thisMultiColor = {};
        for (let key in multiColor) {
            thisMultiColor[key] = {
                region: [0, 0, this.device.width, this.device.height],
                desc: []
            };
            for (let desc of multiColor[key].desc) {
                thisMultiColor[key].desc.push(this.helperBridge.helper.GetFindColorArray(desc[0], desc[1], desc[2]));
            }
            if (multiColor[key].region) {
                let sr = this.helperBridge.getHelper(multiColor[key].region[1], multiColor[key].region[2]).GetPoint(multiColor[key].region[3], multiColor[key].region[4], multiColor[key].region[0]);
                let er = this.helperBridge.getHelper(multiColor[key].region[1], multiColor[key].region[2]).GetPoint(multiColor[key].region[5], multiColor[key].region[6], multiColor[key].region[0]);
                thisMultiColor[key].region = [sr.x, sr.y, er.x, er.y];
            }
        }
        this.multiColor = thisMultiColor;
    },

    /**
     * 执行多点找色
     * @param {String} key src\common\multiColors.js的key
     * @param {Region} inRegion 多点找色区域
     * @returns 
     */
    findMultiColor(key, inRegion) {
        this.initRedList();
        let region = inRegion || this.multiColor[key].region;
        let desc = this.multiColor[key].desc;
        let similar = this.multiColor[key].similar || this.scheme.commonConfig.multiColorSimilar
        for (let i = 0; i < desc.length; i++) {
            let item = desc[i];
            let point = this.helperBridge.helper.FindMultiColor(region[0], region[1], region[2], region[3], item, similar, 1);
            if (point.x !== -1) {
                console.log(`[${key}]第${i}个查找成功， 坐标为：(${point.x}, ${point.y})`);
                return point;
            }
        }
        return null;
    },

    /**
     * 执行多点找色，直到成功为止，返回多点找色坐标
     * @param {String} key src\common\multiColors.js的key
     * @param {Integer} timeout 超时时间(ms)
     * @param {inRegion} inRegion 多点找色区域
     * @returns 
     */
    findMultiColorLoop(key, timeout, inRegion) {
        let times = Math.round(timeout / this.scheme.commonConfig.loopDelay);
        while (times--) {
            this.keepScreen(true);
            let point = this.findMultiColor(key, inRegion);
            if (point) {
                return point;
            }
            sleep(this.scheme.commonConfig.loopDelay);
        }
        return null;
    },

    /**
     * 多点比色，直到成功为止
     * @param {Desc} desc 
     * @param {Integer} timeout 
     * @param {Integer} sign 
     * @returns 
     */
    compareColorLoop (desc, timeout, sign) {
        /**
         * 条件循环多点比色
         *
         * @param description: 色组描述
         * @param sim:         相似度
         * @param offset:      偏移查找
         * @param timeout:     超时时间
         * @param timelag:     间隔时间
         * @param sign:        跳出条件,0为比色成功时返回,1为比色失败时返回
         */
        return this.helperBridge.helper.CompareColorExLoop(desc, this.scheme.commonConfig.colorSimilar, 1, timeout, this.scheme.commonConfig.loopDelay, sign || 0);
    },

    /**
     * 运行脚本
     * @returns 
     */
    run() {
        return this._run();
    },

    /**
     * 运行脚本，内部接口
     * @returns 
     */
    _run() {
        if (this.runThread) return;
        var self = this;
        try {
            if (device.sdkInt >= 24 && !auto.service) {
                toastLog("请开启无障碍服务再启动脚本");
                throw new Error('未开启无障碍服务');
            }
            // helperBridge放进来，funcList里面operator执行时可以从this中取到helperBridge，解决直接导入helperBridge在端报错的问题
            this.helperBridge = helperBridge;
            this.initFuncList();
            this.initMultiColor();
            this.runDate = new Date();
            this.currentDate = new Date();
            this.runTimes = {};
            this.global = {};
            if (null === this.scheme) {
                if (typeof self.stopCallback === 'function') {
                    self.stopCallback();
                }
                return;
            }
        } catch (e) {
            console.error(e);
            if (typeof self.stopCallback === 'function') {
                self.stopCallback();
            }
            return;
        }
        // test start
        // let img = images.captureScreen();
        // img.saveTo('/sdcard/testimg.png');
        // img.recycle();
        // test end
        toastLog(`运行方案[${this.scheme.schemeName}]`);
        // console.log(`运行方案[${this.scheme.schemeName}]`);
        this.runThread = threads.start(function () {
            try {
                while (true) {
                    self.keepScreen(false);
                    for (let i = 0; i < self.scheme.funcList.length; i++) {
                        if (self.oper(self.scheme.funcList[i])) {
                            self.currentDate = new Date();
                            break;
                        }
                    }
                    sleep(self.scheme.commonConfig.loopDelay);
                }
            } catch (e) {
                self.runThread = null;
                if (e.toString().indexOf('com.stardust.autojs.runtime.exception.ScriptInterruptedException') === -1) {
                    console.error($debug.getStackTrace(e));
                }
                if (typeof self.stopCallback === 'function') {
                    self.stopCallback();
                }
            }
        });
        if (typeof this.runCallback === 'function') {
            this.runCallback();
        }
    },

    /**
     * 根据当前界面判断自动运行的脚本
     * 若只有一个方案存在功能比色成功的话直接运行这个方案
     * 若有多个方案，可运行的方案通过悬浮列表进行选择
     * 若没有则提示无法识别当前界面
     * @param {MyFloaty} myfloaty 
     */
    autoRun(myfloaty) {
        let self = this;
        self.keepScreen(false);
        threads.start(function () {
            let staredSchemeList = _.filter(store.get('schemeList', defaultSchemeList), item => {
                return item.star //&& item.id != 99;
            });
            let canRunSchemeList = [];
            let funcDescCess = {};
            for (let j = 0; j < staredSchemeList.length; j++) {
                let tarFuncList = self.getFuncList(staredSchemeList[j]);
                let flag = false;
                for (let i = 0; i < tarFuncList.length; i++) {
                    if (typeof funcDescCess[tarFuncList[i].id] !== 'undefined') {
                        flag = funcDescCess[tarFuncList[i].id];
                        if (flag) {
                            break;
                        }
                    } else {
                        flag = self.desc(tarFuncList[i], staredSchemeList[j].commonConfig);
                        funcDescCess[tarFuncList[i].id] = flag;
                        if (flag) {
                            break;
                        }
                    }
                }
                if (flag) {
                    canRunSchemeList.push(staredSchemeList[j]);
                }
            }
            if (canRunSchemeList.length === 0) {
                toastLog('无法识别当前界面');
            } else if (canRunSchemeList.length === 1) {
                setCurrentScheme(canRunSchemeList[0].schemeName);
                setTimeout(() => {
                    self.run();
                }, 200);
            } else {
                schemeDialog.show(myfloaty, canRunSchemeList);
            }
        });

    },

    /**
     * 停止脚本
     */
    stop() {
        events.broadcast.emit('SCRIPT_STOP', '');
    },

    /**
     * 停止脚本，内部接口
     */
    _stop() {
        if (null !== this.runThread) {
            if (typeof this.stopCallback === 'function') {
                this.stopCallback();
            }
            this.runThread.interrupt();
        }
        this.runThread = null;
    },

    /**
     * 重新运行，一般在运行过程中通过setCurrenScheme切换方案后调用，停止再运行
     */
    rerun() {
        events.broadcast.emit('SCRIPT_RERUN', '');
    },

    /**
     * 关键函数，操作函数
     * 针对func进行多点比色，成功的话按顺序点击oper数组
     * 若operatorFunc为函数，operator则不执行，调用operatorFunc函数
     * @param {*} currFunc 
     * @param {*} retest 重试时间
     */
    oper(currFunc, retest) {
        let operator = currFunc.operator; // 需要计算的坐标通过operater传进去使用
        let operatorFunc = currFunc.operatorFunc;
        if (typeof operatorFunc === 'function') {
            if (operatorFunc.call(null, this, operator)) {
                console.log('执行：' + currFunc.name);
                return true;
            }
        } else {
            for (let id = 0; id < operator.length; id++) {
                let item = operator[id];
                let rs;
                if (item.desc && item.desc.length) {
                    rs = helperBridge.helper.CompareColorEx(item.desc, this.scheme.commonConfig.colorSimilar, 0);
                } else {
                    rs = true;
                }
                // console.log(`执行：currFunc.name:${currFunc.name} currFunc.id:${currFunc.id} lastFunc:${this.lastFunc} id:${id} oper:${item.oper} 比色结果:${rs}`);
                if (rs) {
                    retest = retest || item.retest || undefined;
                    if (retest && retest !== -1) {
                        sleep(retest);
                        this.keepScreen();
                        return this.oper(currFunc, -1);
                    }
                    if (!!currFunc.id && this.lastFunc !== currFunc.id && !item.notForCnt) {
                        if (!this.runTimes[currFunc.id]) {
                            this.runTimes[currFunc.id] = 0;
                        }
                        this.runTimes[currFunc.id]++;
                        this.lastFunc = currFunc.id;
                    }
                    if (drawFloaty.instacne) {
                        let toDraw = [...item.desc.map(kk => {
                            return {
                                color: 'green',
                                region: [kk[0] - 5, kk[1] - 5, kk[0] + 5, kk[1] + 5]
                            }
                        })];
                        // if (item.operStepRandom) {
                        //     item.operStepRandom.forEach(kk => {
                        //         toDraw.push({
                        //             color: 'orange',
                        //             region: [kk[0], kk[1], kk[2], kk[3]]
                        //         });
                        //     });
                        // } else if (item.oper) {
                        //     item.oper.forEach(kk => {
                        //         toDraw.push({
                        //             color: 'orange',
                        //             region: [kk[0], kk[1], kk[2], kk[3]]
                        //         });
                        //     });
                        // }
                        // console.log(`请求绘制：${JSON.stringify(toDraw)}`);
                        
                        drawFloaty.draw(toDraw, 500);
                        sleep(500);
                    }

                    if (item.operStepRandom) {
                        console.log(`执行：currFunc.name:${currFunc.name} currFunc.id:${currFunc.id} lastFunc:${this.lastFunc} id:${id} oper:${item.oper}`);
                        helperBridge.regionStepRandomClick(item.operStepRandom, this.scheme.commonConfig.afterClickDelayRandom);
                    } else if (item.oper) {
                        console.log(`执行：currFunc.name:${currFunc.name} currFunc.id:${currFunc.id} lastFunc:${this.lastFunc} id:${id} oper:${item.oper}`);
                        helperBridge.regionClick(item.oper, this.scheme.commonConfig.afterClickDelayRandom);
                    }
                    return true;
                }
            }
        }
    },

    /**
     * 根据func中的desc进行多点比色
     * @param {*} currFunc 
     */
     desc(currFunc, commonConfig) {
        let operator = currFunc.operator; // 需要计算的坐标通过operater传进去使用
        for (let id = 0; id < operator.length; id++) {
            let item = operator[id];
            if (item.desc && item.desc.length > 3) {
                let res = helperBridge.helper.CompareColorEx(item.desc, commonConfig.colorSimilar, 0);
                if (res) return true;
            }
        }
        return false;
    }
}

events.broadcast.on('SCRIPT_STOP', () => {
    script._stop();
});

events.broadcast.on('SCRIPT_RUN', () => {
    script._run();
});

events.broadcast.on('SCRIPT_RERUN', () => {
    script._stop();
    setTimeout(() => {
        script._run();
    }, 510);
});

export default script;