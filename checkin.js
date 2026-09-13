"ui";
/**
 * 腾讯视频 · 角色签到(表白)
 * 运行环境:AutoJs6 6.7.0+ / 或用 build.py 打包出来的独立 APK
 *
 * 【为什么必须用无障碍脚本,而不是 WebView】
 *   角色签到(我要表白)只在腾讯视频**原生 APP** 里有,网页端没有这个入口。
 *   评论那条线可以用 WebView 后台跑;签到这条线必须操作真的 APP 界面,必须在前台。
 *
 * 【为什么是 UI 模式("ui" 那一行)】
 *   ① 无障碍开关 **App 自己开不了** —— Android 明令禁止(那等于「读全屏 + 模拟任意点击」,
 *      能自己开的话恶意软件就静默拿到了)。只能引导用户去系统设置里亲手点。
 *      所以要有个界面告诉他现在开没开、按钮直接把他送过去。
 *   ② 顺带解决一个时序坑:早先是「一打开 App 就跑脚本」,而 App 冷启动时
 *      无障碍服务是系统**异步绑定**的,脚本 0.02 秒就跑到检查那一行,服务还没绑上,
 *      于是明明权限开着却报「没开」。改成用户点按钮才跑,那时服务早就在了。
 */

// ══════════════ 配置 ══════════════
var 配置 = {
    // 角色页靠 topic_id 直达。取法:APP 角色页右上角「···」→ 分享 → 复制链接,
    // 链接里的 topic_id=commtopic_xxxx 就是。
    //   名     = 界面和日志里显示的名字(可以自己写清楚点)
    //   页面名 = 用来核对「深链有没有跳对页」的字样,要跟角色页标题一模一样;
    //            不写就默认等于 名。
    角色: [
        { 名: "孟剑卿",           topic: "commtopic_b38x8rd8cyhyy" },
        { 名: "叶昭",             topic: "commtopic_b38xgxi5yyhyy" },
        { 名: "陆小凤",           topic: "commtopic_b38t4niyoyhyy" },
        { 名: "沈谢秩",           topic: "commtopic_bao817yceyhyy" },
        { 名: "叶谦",             topic: "commtopic_bz9e6pmoeyhyy" },
        { 名: "龚俊(地球1)",      topic: "commtopic_bsni957xhyhyy", 页面名: "龚俊" },
        { 名: "龚俊(地球超新鲜2)", topic: "commtopic_b3q4sdxpwyhyy", 页面名: "龚俊" }
    ],
    每个角色最多试: 1,         // 失败重试次数(不含第一次)

    /*
     * 干跑:每个角色页都走一遍,但**不点表白**,只报告当前状态。
     * ⚠️ 它只管签到那一层 —— 切号该切还是切,所以能拿来「真切号 + 假表白」验链路。
     * ⚠️ 界面上**没有**干跑按钮了(原先那颗「切号签到(干跑)」已改成真签)。
     *    要干跑就在这里改成 true 再 ./deploy.sh,别再往界面上加测试钮。
     * ⚠️ 调试时非常需要这个 —— 每个角色每天只有一次表白机会,
     *    拿去试脚本就没了(踩过:一轮跑坏的脚本把当天 3 个角色的机会全用掉)。
     *    要看「今天还剩哪几个没签」用这个,零成本。
     */
    /*
     * 多账号:开了之后「开始签到」会把**切换账号列表里的每个号都切一遍**,
     * 每个号跑一轮签到。一轮的定义 = 列表里有几个号就要覆盖几个(含当前这个)。
     */
    多账号: false,

    干跑: false
};
// ═════════════════════════════════

/*
 * 构建标记:打包时由 build.py 替换成真实时间戳。
 * ⚠️ 这不是装饰。inrt **会缓存脚本** —— 只 `pm install` 不 `pm clear` 的话,
 *    APK 换了新脚本、App 跑的还是旧的,而且**毫无迹象**。
 *    我为此白改了好几轮,还有一次跑着旧脚本把当天 7 个角色的表白机会全用光了。
 *    现在启动日志第一行就报这个戳,跟 build.py 打印的对一下就知道装对没有。
 */
var 构建标记 = "远程 2026.09.13.13";

/*
 * ── 用哪个腾讯视频 ──
 *
 * 不写死包名去猜,而是**问系统「谁能处理 txvideo:// 」** —— 判据是能力不是名字,
 * 所以国际版、改过名的包、以后新出的变体,都会自动落到正确答案上。
 *   0 个候选  → 提示没装
 *   1 个      → 直接用,不烦用户
 *   2 个以上  → 让用户选一次,记住
 *
 * ⚠️ 分身/双开够不着:Samsung 双开的应用在**另一个 Android 用户**下,
 *    我们的 App 跑在主用户,Intent 和无障碍都是按用户隔离的,
 *    技术上根本到不了那份。这点要如实告诉用户,不能假装支持。
 */
var 默认腾讯包 = "com.tencent.qqlive";
var 腾讯包 = 默认腾讯包;          // 启动时由 定腾讯包() 改写

/** 问系统:哪些应用能处理我们的深链。返回 [{包名, 名字, 版本}] */
function 腾讯候选() {
    var 出 = [];
    try {
        var it = new android.content.Intent(android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse("txvideo://v.qq.com/TopicFeedsPageActivity"));
        var pm = context.getPackageManager();
        var 表 = pm.queryIntentActivities(it, 0);
        var 见过 = {};
        for (var i = 0; i < 表.size(); i++) {
            var 包名 = String(表.get(i).activityInfo.packageName);
            if (见过[包名]) continue;
            见过[包名] = true;
            var 名字 = 包名, 版本 = "?";
            try {
                var ai = pm.getApplicationInfo(包名, 0);
                名字 = String(pm.getApplicationLabel(ai));
                版本 = String(pm.getPackageInfo(包名, 0).versionName);
            } catch (e) {}
            出.push({ 包名: 包名, 名字: 名字, 版本: 版本 });
        }
    } catch (e) { 诊("查腾讯候选出错:" + e); }
    return 出;
}

/** 定下这次用哪个。有记住的就用记住的(前提是它还在候选里)。 */
function 定腾讯包() {
    var 候选 = 腾讯候选();
    if (!候选.length) { 腾讯包 = 默认腾讯包; return 候选; }
    var 记住的 = "";
    try { if (偏好) 记住的 = String(偏好.get("腾讯包", "") || ""); } catch (e) {}
    for (var i = 0; i < 候选.length; i++) {
        if (候选[i].包名 === 记住的) { 腾讯包 = 记住的; return 候选; }
    }
    腾讯包 = 候选[0].包名;         // 没记住过、或记的那个已经不在了
    return 候选;
}
var 角色页Activity = "TopicFeedsPageActivity";

/*
 * ── 日志放哪 ──
 * 写进「App 自己的外部私有目录」= /sdcard/Android/data/<包名>/files/
 * 这个目录**不需要任何存储权限**(Android 4.4 起就是这样),卸载 App 会自动清掉。
 *
 * ⚠️ 不要写 /sdcard/xxx.txt。那属于共享存储,写它就得要 MANAGE_EXTERNAL_STORAGE
 *    (「所有文件访问权限」)—— 一个签到工具要这种权限,用户看了会怕。
 */
var 日志档 = (function () {
    try {
        return files.join(context.getExternalFilesDir(null).getAbsolutePath(), "checkin_log.txt");
    } catch (e) {
        return "/sdcard/qq_checkin_log.txt";
    }
})();

/*
 * 日志前缀:每行都标明「这一步发生在哪个账号上」,多账号时再加「第几轮/共几轮」。
 * 不然三个号 × 七个角色的日志混在一起,出了问题根本分不清是哪一段。
 *   单号:   [09:30:36][某某账号] ── 孟剑卿 ──
 *   多号:   [09:30:56][2/3 另一个账号] ── 孟剑卿 ──
 */
/*
 * 当前在哪一页:"" 主页 / "日志" / "版本"。
 * ⚠️ 用一个变量而不是每页一个布尔 —— 布尔多了必然出现「两页同时可见」那种状态。
 *    所有页都是同一个 layout 里的一块,不新开 Activity(Activity 要写进 manifest,
 *    而 manifest 远程更新改不了)。
 */
var 当前页 = "";
var 展开设置 = true;         // 三行权限那块张开没有。**预设张开**,收起状态记进偏好
var 展开受限 = false;        // 「开关是灰的?」那一段展开没有
var 自动展开过 = false;      // 只自动展开一次,之后听用户的
var 试过开无障碍 = false;    // 用户点过「去开启无障碍」没有
var 看诊断 = false;          // 日志页里要不要显示 [诊断] 行
var 上次结果 = "";            // 跑完留在界面上的那行结果,见布局里的 结果区
var 本轮报过页面账号 = false;   // 见 签一个:每轮至少把读到的页面账号报一次
var 轮摘要 = [];          // 多账号时每个号一条摘要,结束一起发通知
var 多账号进行中 = false;  // 多账号模式下,单轮结束不要把本 App 拉回前台(见 跑一轮 末尾)
var 当前账号名 = "";     // 从角色页的「我的贡献」里读出来的,也用来核对页面属于哪个号
var 轮次前缀 = "";       // 「2/3 」,单号模式为空

var 行 = [];
var 换行符 = String.fromCharCode(10);   // 本文件一律不写反斜杠转义,见 build.py 的 找跨行字符串
/*
 * 日志分两类:
 *   · 运行明细 —— 用户要看的「第几个角色、签没签到」
 *   · 诊断     —— 构建标记、环境、通知发出去没有…… 报障时才有用
 * 混在一起用户看不懂(原话:「日志的内容似乎有分通知内容,每次运行日志,还有不明内容」)。
 * 诊断行打上标记:实时区不显示,日志页里要手动展开才看得到。
 */
var 诊断标记 = "[诊断]";
function 诊(s) { 记(s, true); }
/*
 * 时间戳:年年/月月/日日 时时:分分,24 小时制,手机本地时间。
 * ⚠️ 不要用 toLocaleString() —— 它跟着系统语言走,这台机子是日文,出来的格式不一样。
 *    getHours() 本来就是 24 小时制,不用额外处理。
 */
function 两位(n) { return ("0" + n).slice(-2); }
function 时间戳(t) {
    t = t || new Date();
    return t.getFullYear() + "/" + 两位(t.getMonth() + 1) + "/" + 两位(t.getDate())
         + " " + 两位(t.getHours()) + ":" + 两位(t.getMinutes());
}

function 记(s, 是诊断) {
    var 戳 = 时间戳();
    var 头 = (轮次前缀 || 当前账号名) ? "[" + 轮次前缀 + 当前账号名 + "]" : "";
    行.push("[" + 戳 + "]" + (是诊断 ? 诊断标记 : "") + 头 + " " + s);
    console.log(s);
    try { files.write(日志档, 行.join(换行符)); } catch (e) {}
    刷日志();
}

// ══════════════ 界面 ══════════════
ui.layout(
    <vertical bg="#f2f2f5" h="*">
        <text id="标题" text="每日表白" textSize="24sp" textStyle="bold" textColor="#1f1f1f" margin="20 24 20 14"/>
        {/*
          ⚠️ 闲置态必须能滚。原先整页不可滚,结果卡一出现就把最底下的「运行日志 ›」
             顶到屏幕外(实测最后一个节点正好压在导航栏上),那个入口就等于不存在。
        */}
        <scroll id="主滚动" h="*">
        {/* scroll 只能有一个直接子 view,所以套一层:上面是脚本列表卡,下面是结果卡 */}
        <vertical>
        {/* 上面这张卡只装「设置」;按钮在下面**另一张卡**里,中间隔一条底色 */}
        <vertical id="设置卡" bg="#ffffff" margin="14 0" padding="18">

            

            

            {/*
              常驻的权限列表。
              ⚠️ 原先是「只在没开的时候冒出一块提示」,问题是**全开好之后界面上一点痕迹都没有** ——
                 用户没法确认自己到底开了什么,想回头关掉也无从下手。
                 大众 App 的通行做法是一个常驻列表:每项显示状态,点了跳对应的系统设置页。
              ⚠️ 三行**不是一类东西**,所以长得不一样 —— 差别必须让用户看得出来,不能让他猜:
                 · 前两行是**系统级授权,App 自己扳不动**(Android 明令禁止)。点击只能把用户
                   送到系统页面 → 右边是「状态 + 常驻箭头 ›」,这是「会跳走」的视觉语言。
                   做成 Switch 会骗人:一拨就跳走、回来还是原样,像坏了。
                 · 第三行是 **App 自己的偏好**(跑完发不发),我们能就地切换 → 右边是真 Switch。
                 这正是 Android 系统设置自己在用的区分:导航用箭头,就地切换用 Switch。
              ⚠️ 箭头要**常驻**。原先只在「未开启」时才画箭头,可是两行无论开没开都能点 ——
                 开启之后箭头消失,看起来就不可点了,是在说谎。
            */}
            {/*
              三行权限是**设置**,不是每天要看的东西 —— 开好之后能收起来,
              把首屏让给真正常用的那几颗按钮。**预设是张开的。**
              ⚠️ **无障碍没开时不许收起**:那是签到的前提,收起来等于把唯一的入口藏了,
                 新用户会卡在「点开始 → 失败」的循环里。所以这时候**连箭头都不画** ——
                 不可点的东西就不该长成可点的样子。
              ⚠️ 收起时标题下面补一行摘要,别让三个状态凭空消失。
            */}
            <horizontal id="设置标题行" h="52" gravity="center_vertical">
                <vertical w="0" layout_weight="1">
                    <text text="设置" textSize="16sp" textColor="#1f1f1f"/>
                    <text id="设置摘要" text="" textSize="12sp" textColor="#8a8a8a"
                          visibility="gone"/>
                </vertical>
                <text id="设置箭头" text="⌄" textSize="15sp" textColor="#8a8a8a"/>
            </horizontal>
            <vertical id="权限区">
                <horizontal id="行无障碍" h="64" gravity="center_vertical">
                    <vertical w="0" layout_weight="1">
                        <text text="无障碍服务" textSize="15sp" textColor="#1f1f1f"/>
                        <text text="必需 · 读页面、点按钮" textSize="12sp" textColor="#8a8a8a"/>
                    </vertical>
                    <text id="态无障碍" text="—" textSize="14sp" textColor="#8a8a8a"/>
                </horizontal>

                {/*
                  没开无障碍时的引导。**贴着它管的那一行**,不要散到别处去。
                  ⚠️ 原先是散成三处:顶上这一行、中间一个黄色「受限设置」框、底下主钮变成
                     「去开启无障碍」—— 同一件事三个入口,而且「打开应用信息」排在
                     「去开启」前面,可它多数人根本不需要做。用户原话:「有点重复」「顺序感觉有点怪」。
                  ⚠️ 受限设置收成一行可展开的:**多数手机不需要**,只有开关点不动时才要。
                     真检测到被挡(可能被受限设置挡())时自动展开一次,不用用户自己去猜。
                */}
                <vertical id="无障碍引导" visibility="gone" bg="#fdeceb" padding="14" margin="0 6 0 10">
                    <text text="表白必须先开这个,不然读不到页面、也点不了按钮。"
                          textSize="13sp" textColor="#8a1c14"/>
                    <button id="去开无障碍钮" text="去开启无障碍" textSize="17sp" h="56"
                            margin="0 10 0 6" bg="#b3261e" textColor="#ffffff"/>
                    <text text="打开后:点「已安装的应用」(有的手机叫「已下载的服务」)&#10;→ 往下找「小菇爱表白」→ 打开开关"
                          textSize="13sp" textColor="#8a1c14"/>
                    <text id="受限标题" text="开关是灰的、点不动? ›" textSize="13sp"
                          textColor="#1a73e8" margin="0 10 0 0" padding="0 4"/>
                    <vertical id="受限详情" visibility="gone" margin="0 6 0 0">
                        <text text="Android 13 以后,从文件装的应用要先解锁一次:&#10;打开应用信息 → 点右上角那三个点 → 允许受限设置&#10;(个别品牌位置不同,找带「受限」字样的那一项)"
                              textSize="13sp" textColor="#8a5300"/>
                        <button id="受限钮" text="打开应用信息" textSize="15sp" h="48"
                                margin="0 8 0 0" bg="#f57c00" textColor="#ffffff"/>
                    </vertical>
                </vertical>

                <text h="1" bg="#ececec"/>
                <horizontal id="行悬浮" h="64" gravity="center_vertical">
                    <vertical w="0" layout_weight="1">
                        <text text="悬浮窗" textSize="15sp" textColor="#1f1f1f"/>
                        <text text="可选 · 跑的时候看进度、随时暂停" textSize="12sp" textColor="#8a8a8a"/>
                    </vertical>
                    <text id="态悬浮" text="—" textSize="14sp" textColor="#8a8a8a"/>
                </horizontal>
                <text h="1" bg="#ececec"/>
                {/*
                  ⚠️ 这一行跟上面两行不一样,右边是**真开关**。
                     上面两个是纯系统权限,App 扳不动,所以只能显示状态。
                     通知有两层:系统权限(要不要给)+ App 自己的偏好(跑完发不发)。
                     后者是我们自己的事,该给开关。
                */}
                <horizontal id="行通知" h="64" gravity="center_vertical">
                    <vertical w="0" layout_weight="1">
                        <text text="跑完发通知" textSize="15sp" textColor="#1f1f1f"/>
                        <text id="通知说明" text="把结果发到通知栏" textSize="12sp" textColor="#8a8a8a"/>
                    </vertical>
                    {/*
                      状态文字和开关**并存**,同一时刻只显示一个 —— 因为这一行有两个阶段:
                        · 系统权限还没给 → 它就是一道门,点了只能跳系统设置 → 显示「未开启 ›」
                        · 权限给过之后   → 「跑完发不发」是 App 自己的偏好 → 显示真 Switch
                      ⚠️ 不能一直摆个 Switch:权限没给时一拨就跳走、回来还是原样,像坏了。
                         而且会留下「偏好=要发,但系统不让」这种自相矛盾的状态。
                    */}
                    <text id="态通知" text="—" textSize="14sp" textColor="#8a8a8a"/>
                    <Switch id="通知开关" checked="false"/>
                </horizontal>
                {/*
                  ⚠️ 这里**曾经**有一行脚注「带 › 的要去系统设置里开,App 自己开不了」,已删。
                     它是在解释一个**已经看得懂的东西** —— 每行右边就写着「已开启 ›/未开启 ›」,
                     点进去是系统页面这件事,点一次就知道了。为它多占一行、把整块撑高,不值。
                */}
            </vertical>
        </vertical>

        {/*
          脚本区 —— **跟上面的「设置」分成两张卡**,中间留一条页面底色(#f2f2f5)。
          ⚠️ 一度是同一张白卡从头铺到尾,两块内容之间只有空白,看着像一个区块连在一起,
             用户分不出「上面是设置、下面是要点的东西」。跟当初「上次结果」那张卡同样的毛病:
             **分区靠的是底色断开,不是靠留白。**
        */}
        <vertical id="脚本卡" bg="#ffffff" margin="14 12 14 0" padding="18">
            <button id="切签钮" text="♥&#65038; 开始表白(切号)" textSize="18sp" h="66"
                    margin="0 0 0 12" bg="#e8437c" textColor="#ffffff"/>
            {/*
              两颗按钮的差别只有**范围**:当前这个号 / 切换列表里的每个号。
              ⚠️ 所以用同一个色系、深浅不同,不要一蓝一紫 —— 那会让人以为是两种不同的东西。
                 (紫色那颗原先是「干跑」测试钮,现在是真签了,颜色也得跟着改口径。)
              ⚠️ 曾经还有第三颗「开始切号(只切不签)」和「干跑」,是开发期用来省表白机会的,
                 链路验完就删了 —— 普通用户看见只会困惑。要干跑改 配置.干跑 即可。
            */}
            <button id="主钮" text="请稍候" textSize="17sp" h="66"
                    margin="0 0 0 2" bg="#fdeaf1" textColor="#c2185b"/>

            

            {/* 两个入口都放在按钮**下面**:它们不是主功能,不该占首屏最上头 */}
            <text id="看版本" text="版本信息 / 更新 ›" textSize="14sp"
                  textColor="#1a73e8" margin="0 14 0 4" padding="0 6"/>
            <text id="看日志" text="运行日志 ›" textSize="14sp"
                  textColor="#1a73e8" margin="0 4 0 4" padding="0 6"/>

            
        </vertical>

        {/*
          上一次跑完的结果 —— 跟通知栏那条是同一份文字。
          ⚠️ 放在**最下面、单独一张卡**,而且**底色要跟上面那张白卡不一样**(淡绿 #eef7ee)。
             一度改成白底,结果跟上面的脚本列表卡连成一片,看着像同一个区块。
             原先挤在权限列表上头,用户分不清它是什么、也不知道怎么弄走。
          ⚠️ 必须能关(右上角 ✕),关掉写进偏好,重启不会自己回来。
        */}
        <vertical id="结果区" visibility="gone" bg="#eef7ee" margin="14 12 14 14" padding="18">
            <horizontal gravity="center_vertical">
                <text text="上次结果" textSize="12sp" textColor="#5a7a5c" w="0" layout_weight="1"/>
                <text id="关结果" text="✕" textSize="16sp" textColor="#5a7a5c" padding="8 0 0 8"/>
            </horizontal>
            <text id="结果文" text="" textSize="15sp" textColor="#1e4620" margin="0 4 0 0"/>
        </vertical>
        </vertical>
        </scroll>

        {/*
          跑起来时的界面。跟闲置态完全不重叠 —— 那边是「要做什么」(权限、按钮、上次结果),
          这边是「正在做什么」(进度、暂停/停止、实时明细),所以分成两块整体切换。
        */}
        <vertical id="跑动卡" visibility="gone" h="*" bg="#ffffff" margin="14 0" padding="18">
            {/* 跑起来的时候才显示进度,平时藏着 */}
            <text id="状态" text="" textSize="17sp" gravity="center"
                  padding="16" bg="#e3f0f8" textColor="#12496b" visibility="gone"/>
            {/* 跑起来之后主钮换成这一条。两个按钮,不是三个 ——
                「开始」和「暂停/继续」不会同时有意义。*/}
            <horizontal id="控制条" visibility="gone" margin="0 18 0 6">
                <button id="暂停钮" text="暂停" textSize="18sp" h="60" layout_weight="1"
                        bg="#f57c00" textColor="#ffffff"/>
                <button id="停止钮" text="停止" textSize="18sp" h="60" layout_weight="1"
                        margin="10 0 0 0" bg="#b3261e" textColor="#ffffff"/>
            </horizontal>
            {/*
              实时明细。⚠️ 只在**跑的时候**显示 —— 常驻的话跟日志页完全重复,
              而且平时首屏底下挂一大块滚动文字,用户分不清它跟结果卡、跟日志页是什么关系。
            */}
            <scroll id="滚动" h="*" bg="#fafafa" visibility="gone">
                <text id="日志" text="(还没开始)" textSize="13sp" textColor="#666666" padding="14"/>
            </scroll>
        </vertical>

        {/* 版本信息页。跟日志页一样是同一个 layout 里的一块,不新开 Activity */}
        <vertical id="版本页" visibility="gone" h="*" bg="#ffffff" margin="14 0">
            <horizontal gravity="center_vertical" padding="14 12">
                <text id="版本返回" text="‹ 返回" textSize="16sp" textColor="#1a73e8" w="0" layout_weight="1"/>
            </horizontal>
            <text h="1" bg="#ececec"/>
            <scroll h="*">
                <vertical padding="18">
                    <text id="版本正文" text="" textSize="14sp" textColor="#333333"/>
                    <button id="查更新钮" text="检查更新" textSize="16sp" h="52"
                            margin="0 18 0 6" bg="#1a73e8" textColor="#ffffff"/>
                    {/* 只在真的有新安装包时才出现 —— 平时不该让用户看到一个点不动的按钮 */}
                    <button id="装新包钮" text="下载并安装新版" textSize="16sp" h="52"
                            visibility="gone" margin="0 8 0 6" bg="#1e8e3e" textColor="#ffffff"/>
                    {/* 只有当系统里不止一个应用能处理 txvideo:// 时才出现 */}
                    <text id="换腾讯" text="换一个腾讯视频 ›" textSize="14sp" textColor="#1a73e8"
                          visibility="gone" margin="0 14 0 4" padding="0 6"/>
                    <text id="查更新说明" text="" textSize="13sp" textColor="#8a8a8a" margin="0 4 0 0"/>
                </vertical>
            </scroll>
        </vertical>

        {/*
          日志页。
          ⚠️ 必须是**同一个 Activity 里的一块**,靠显示/隐藏切换,不能新开 Activity ——
             Activity 要写进 manifest,而 manifest **远程更新改不了**
             (将来脚本从 Git 拉新版,换得掉界面,换不掉 manifest)。
             也不要跳模板自带的 LogActivity,那一页的 ⋮ 通向第二套权限界面。
        */}
        <vertical id="日志页" visibility="gone" h="*" bg="#ffffff" margin="14 0">
            <horizontal gravity="center_vertical" padding="14 12">
                <text id="日志返回" text="‹ 返回" textSize="16sp" textColor="#1a73e8" w="0" layout_weight="1"/>
                <text id="日志诊断" text="显示诊断" textSize="13sp" textColor="#8a8a8a" padding="8"/>
                <text id="日志清空" text="清空" textSize="13sp" textColor="#b3261e" padding="8"/>
            </horizontal>
            <text h="1" bg="#ececec"/>
            <scroll id="日志滚动" h="*">
                <text id="日志全文" text="" textSize="12sp" textColor="#444444" padding="14"/>
            </scroll>
        </vertical>
    </vertical>
);

/*
 * ── 运行控制 ──
 * 跑着 / 暂停 / 中止 三个标志由 UI 线程写、工作线程读。JS 是单线程调度的,
 * 这里不需要锁 —— 工作线程只在 检查点() 里读它们。
 */
var 控制 = { 跑着: false, 暂停: false, 中止: false };
var 进度号 = "";     // 「3/7」
var 进度名 = "";     // 「陆小凤」;暂停时是「下一个要做的那个」
// 中止用「抛一个哨兵对象」实现,好跟真正的异常区分开 —— 不然用户按停止会被
// 当成脚本出错记进日志。
var 中止信号 = { 用户中止: true };

/**
 * 可中断点。
 *
 * 【为什么暂停只在角色与角色之间生效】
 *   「点了表白、还没读到结果」那几秒**不能停** —— 停在那里会留下一个
 *   不知道成没成的状态,恢复之后也判断不了。所以暂停的粒度定成
 *   「做完手上这个角色再停」,用户按下去到真的停可能要等几秒,这是对的。
 * 【中止不一样】
 *   它在任何等待循环里都能立刻响应 —— 反正要放弃了,不在乎当前这个的结果。
 */
function 检查点(下一个) {
    if (控制.中止) throw 中止信号;
    if (控制.暂停) {
        进度名 = 下一个;
        刷新状态();
        记("‖ 已暂停,下一个:" + 下一个);
        while (控制.暂停 && !控制.中止) sleep(300);
        if (控制.中止) throw 中止信号;
        记("▶ 继续");
    }
}

/** 把日志推到界面上(只留最后 60 行,不然文本越滚越卡) */
function 刷日志() {
    // 实时区只给运行明细,诊断行滤掉 —— 它们归日志页里的「诊断」
    var 明细 = 行.filter(function (l) { return l.indexOf(诊断标记) < 0; });
    var 文 = 明细.slice(-60).join(换行符);
    ui.run(function () {
        ui.日志.setText(文 || "(还没开始)");
        ui.滚动.post(function () { ui.滚动.fullScroll(android.view.View.FOCUS_DOWN); });
    });
}

/**
 * 刷新状态条和按钮。
 * ⚠️ 按钮的文字**跟着无障碍状态变**:没开的时候它不是「开始签到」而是「去开启无障碍」,
 *    点了直接送去系统设置页 —— 不要让用户先点「开始」再吃一个失败提示。
 */
/**
 * 无障碍到底开没开。
 *
 * ⚠️ 不能只信 `auto.service`。实测:打包版里系统 `dumpsys accessibility` 明明已经把
 *    本应用的服务列为已绑定,`auto.service` 读出来还是 null(时机 / 打包版内部实现差异)。
 *    只信它的话,界面会一直显示「未开启」,用户开了也没用。
 * 所以以**系统设置**为准 —— 那是 Android 自己的账本,谁也骗不了;
 * `auto.service` 只作为补充(它非空就一定是开着的)。
 */
function 无障碍开着() {
    try {
        if (auto.service != null) return true;
    } catch (e) {}
    try {
        var cr = context.getContentResolver();
        var 开关 = android.provider.Settings.Secure.getInt(cr, "accessibility_enabled", 0);
        if (开关 !== 1) return false;
        var 名单 = android.provider.Settings.Secure.getString(cr, "enabled_accessibility_services");
        return !!名单 && String(名单).indexOf(context.getPackageName() + "/") >= 0;
    } catch (e) {
        return false;
    }
}

/**
 * 会不会被 Android 13+ 的「受限设置」挡住。
 *
 * 【这是什么】
 *   Android 13 起,**从文件安装**的应用(用户在文件管理器/浏览器里点 APK 装的)
 *   默认不许开无障碍、通知读取这类高危开关 —— 设置里的开关点不动,弹「受限设置」。
 *   要先去 应用信息 → 右上角 ⋮ → 「允许受限设置」解锁一次。
 *   从应用商店装的不受此限。
 *
 * 【实测证据】(S23 / Android 16)
 *   本应用   installerPackageName=null,ACCESS_RESTRICTED_SETTINGS: default(+有 rejectTime)
 *   腾讯视频 installerPackageName=com.google.android.packageinstaller,该 op = allow
 *   开发时用 adb `settings put secure` 直接写,绕过了设置界面的这道检查,所以一直没撞上;
 *   **用户从文件装一定会撞。**
 *
 * 【怎么判断 —— 这里只能推断,测不出来】
 *   ⚠️ 试过直接问系统那个 appop:
 *       appOps.unsafeCheckOpNoThrow("android:access_restricted_settings", 自己的uid, 自己的包名)
 *     结果是 **SecurityException**:
 *       verifyIncomingOp: uid does not have any of {MANAGE_APPOPS, GET_APP_OPS_STATS, MANAGE_APP_OPS_MODES}
 *     连查自己的都不行。所以「到底被没被挡」App 是问不到的。
 *
 *   退而求其次,按**安装来源**推断:应用商店装的不受限,其它(文件管理器/浏览器/adb)可能受限。
 *   宁可多显示一条提示,也不能在真被挡住时一声不吭 —— 那种情况用户只会觉得「这 App 坏了」。
 *   而且这条提示只在「无障碍还没开」的时候才出现,已经开好的用户永远看不到。
 */
var 商店们 = [
    "com.android.vending",                  // Google Play
    "com.sec.android.app.samsungapps",      // Galaxy Store
    "com.huawei.appmarket",
    "com.xiaomi.market",
    "com.heytap.market",
    "com.bbk.appstore"
];

function 安装来源() {
    var pm = context.getPackageManager();
    try {
        return pm.getInstallSourceInfo(context.getPackageName()).getInstallingPackageName();
    } catch (e) {
        try { return pm.getInstallerPackageName(context.getPackageName()); } catch (e2) { return null; }
    }
}

/*
 * 「可能」被受限设置挡着 —— 按安装来源猜,只用来写诊断日志。
 *
 * ⚠️ 别拿它决定界面。它跟「现在真的被挡着」不是一回事:实测 appop 已经是 allow
 *    (用户早解锁过)、安装来源仍然是 null,于是永远误报。
 * ⚠️ 也别指望直接问 appop:`unsafeCheckOpNoThrow("android:access_restricted_settings", …)`
 *    在这台机器上会抛异常(那个 op 字符串在部分版本是隐藏的),悄悄落回猜的分支。
 *    界面改用**行为判据**:用户点过「去开启」、回来还是没开 —— 见 试过开无障碍。
 */
function 可能被受限设置挡() {
    if (android.os.Build.VERSION.SDK_INT < 33) return false;   // Android 12 及以下没这机制
    var 来源 = 安装来源();
    return !(来源 && 商店们.indexOf(String(来源)) >= 0);
}

ui.受限钮.on("click", function () {
    try {
        var it = new android.content.Intent(
            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            android.net.Uri.parse("package:" + context.getPackageName()));
        it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(it);
        toast("点右上角三个点 → 允许受限设置");
    } catch (e) {
        toast("打不开应用信息页:" + e);
    }
});

/* ══════════════ 悬浮窗 ══════════════
 *
 * 【为什么非要它不可】
 *   脚本跑起来之后屏幕上是**腾讯视频**,我们的界面在后台。没有悬浮窗:
 *     ① 用户看不到「现在是脚本在动」—— 只看到页面自己在跳,像中了邪
 *     ② 想暂停/停止,得切回本 App —— 而切回来的那一下**会抢走前台**,
 *        把当前这个角色搞失败(实测踩过,后来加了「重发深链」才兜住)
 *   悬浮条把这两件事一次解决:一直看得见,而且按按钮不用离开腾讯。
 *
 * 【为什么用 rawWindow 而不是 window】
 *   `floaty.window` 会获取焦点(为了能输入文字),那等于又抢前台,白改了。
 *   `floaty.rawWindow` 不抢焦点,但能接收点击 —— 正好。
 *
 * 【所有调用都包 try/catch】
 *   悬浮窗是锦上添花,权限没给、厂商魔改、创建失败……都不该让签到本身挂掉。
 */
var 控制条 = null;
var 引导批次 = 0;       // 点「去开启无障碍」/ 回到本应用 都会 +1,让上一批 toast 自动作废
// 悬浮条刚创建的头几百毫秒视图还没挂上,setText 必然失败一两次 —— 那是正常的,
// 不该打进用户日志。连续失败很多次才是真出事了。
var 条错次数 = 0;

function 悬浮窗开着() {
    try { return android.provider.Settings.canDrawOverlays(context); }
    catch (e) { return false; }
}

function 求悬浮窗() {
    try {
        var it = new android.content.Intent(
            android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:" + context.getPackageName()));
        it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(it);
        toast("打开「显示在其他应用上层」");
    } catch (e) {
        toast("打不开悬浮窗设置:" + e);
    }
}

function 开控制条() {
    if (控制条 || !悬浮窗开着()) return;
    try {
        /* 靠右的竖条,半透明。
         * ⚠️ 原先是横跨屏幕顶部的横条,压在「我要表白」按钮上沿 —— 挡字,
         *    而且离「用悬浮条把自己要点的按钮挡住」只差几十像素。
         * ⚠️ 所有宽高都写死(dp)。悬浮窗的尺寸是创建那一刻按内容量的,
         *    之后 setText 再长也不重新量,多出来的字会被裁 —— 尺寸必须恒定。
         *    文字给固定高度 42dp,两行一行都不改变整体高度。
         */
        控制条 = floaty.rawWindow(
            <frame>
                <vertical id="盒" bg="#f5202124" padding="10" gravity="center">
                    <text id="字" text="准备中" textColor="#ffffff" textSize="11sp"
                          w="88" h="42" gravity="center"/>
                    <button id="暂" text="暂停" w="88" h="40" textSize="12sp"
                            bg="#f1f3f4" textColor="#202124"/>
                    <button id="停" text="停止" w="88" h="40" textSize="12sp"
                            margin="0 8 0 0" bg="#e5484d" textColor="#ffffff"/>
                </vertical>
            </frame>);
        /*
         * ⚠️⚠️ 悬浮窗创建之后**什么都不能立刻做** —— 窗口还没 attach 到 WindowManager 上:
         *     setTouchable / setSize / setPosition → NullPointerException:
         *         WindowManager.updateViewLayout(...) on a null object reference
         *     控制条.暂 / 控制条.停(取视图) → undefined,再 .on() 就是 TypeError
         *
         * 最阴的地方:**这时窗口已经显示在屏幕上了**。所以异常被 catch 一吞、变量置回 null,
         * 现象就成了「悬浮条明明看得见,但文字不更新、按钮按了没反应」——
         * 那是一个没人管的孤儿窗口。查了四轮才定位到。
         *
         * 所以:创建之后**只做 setText**(那个不走 updateViewLayout),
         * 其余全部延后到 setTimeout 里。
         */
        setTimeout(function () {
            try { 控制条.setTouchable(true); } catch (e) {}
            try {
                // dp → px 自己算,别写死像素 —— 不同机器密度不一样
                var 密 = context.getResources().getDisplayMetrics().density;
                // 内容 88 宽 + 左右各 10 padding = 108;高 42+40+8+40 + 上下 20 = 150
                var 宽 = Math.round(110 * 密), 高 = Math.round(154 * 密);
                控制条.setSize(宽, 高);
                // 贴右边缘、竖向放在 45% 高度处。
                // 表白按钮实测在 y≈328~370,这里从 y≈0.45*屏高 才开始,隔得很开。
                // 往里缩一点,不要贴死屏幕右缘 —— 贴死了圆角就白做了
                var 缩 = Math.round(8 * 密);
                控制条.setPosition(device.width - 宽 - 缩, Math.round(device.height * 0.45));
            } catch (e) {}
            /*
             * 上妆。⚠️ 跟主界面一样,圆角写不进布局(bg 只吃颜色),得建 drawable 塞进去;
             *    而这里**必须放在 setTimeout 里** —— attach 之前 控制条.盒 取出来是 undefined。
             */
            try {
                var 玻璃 = new android.graphics.drawable.GradientDrawable();
                // ⚠️ 别太透。原来是 36% 黑,后来试过 90%,**底下页面的字还是会透上来**,
                //    压在腾讯那种满屏文字的页面上一片糊。96% 才干净,又还看得出是浮层。
                玻璃.setColor(colors.parseColor("#f5202124"));
                玻璃.setCornerRadius(18 * 屏幕密度);
                控制条.盒.setBackground(玻璃);
                // 胶囊(圆角 = 高度一半)。深卡上用浅色按钮更清楚,停止保留红色语义。
                装按钮(控制条.暂, "#f1f3f4", "#202124", "#33000000", 20);
                装按钮(控制条.停, "#e5484d", "#ffffff", 白纹, 20);
            } catch (e) { 诊("(悬浮条上妆失败:" + e + ")"); }
            try {
                控制条.暂.on("click", function () {
                    控制.暂停 = !控制.暂停;
                    刷新状态();
                    toast(控制.暂停 ? "做完手上这个角色就停" : "继续");
                });
                控制条.停.on("click", function () {
                    控制.中止 = true; 控制.暂停 = false;
                    toast("正在停止…");
                });
            } catch (e) { 诊("(悬浮条按钮接不上:" + e + ")"); }
        }, 500);
    } catch (e) {
        控制条 = null;
        诊("(悬浮控制条创建失败:" + e + ")");
    }
}

function 关控制条() {
    try { if (控制条) 控制条.close(); } catch (e) {}
    控制条 = null;
}


/* ═════════════════════════════════ */

/** 权限列表右边那一格:已开启=绿,未开启=红并带个 ›,暗示可以点 */
/*
 * 系统权限行右边的状态。
 * ⚠️ 箭头 `›` **两种状态都要有** —— 这两行无论开没开都能点(点了都跳系统设置)。
 *    原先只在「未开启」时画箭头,开启之后箭头消失,看起来就不可点了。
 */
function 写状态(视图, 开着) {
    视图.setText((开着 ? "已开启" : "未开启") + "  ›");
    视图.setTextColor(colors.parseColor(开着 ? "#1b7f3b" : "#b3261e"));
}

/*
 * 按钮的样子。
 *
 * ⚠️ 圆角**没法写在布局里** —— `bg` 只吃颜色字符串,给不了 drawable。
 *    只能建 GradientDrawable 再 setBackground。
 * ⚠️⚠️ 一旦 setBackground,**系统自带的按下反馈就没了**,点上去毫无动静、看着像坏的。
 *    所以必须自己包一层 RippleDrawable。这条很容易漏 —— 静态截图上完全看不出来。
 * ⚠️ 还要 setStateListAnimator(null):系统默认按钮带一套「按下抬起」的阴影动画,
 *    配自绘背景会在圆角外面露出一圈方形阴影。
 * ⚠️ 谁 setBackgroundColor 谁就把这套背景冲掉(踩点:暂停钮原来每秒改一次颜色)。
 *    要变色就重新调 装按钮(),别用 setBackgroundColor。
 */
var 屏幕密度 = (function () {
    try { return context.getResources().getDisplayMetrics().density; } catch (e) { return 3; }
})();

/*
 * 底色可以给一个颜色,也可以给 [上, 下] 两个颜色做渐层 —— 主按钮用渐层照着 logo 来
 * (icon.png 实测是 #f56a97 → #e13665 的粉色渐层 + 白爱心)。
 * ⚠️ 渐层构造器要的是 int[],靠 Rhino 自动转;万一转不过去就退回纯色,别让按钮整个没背景。
 */
function 圆角面(底色) {
    if (Object.prototype.toString.call(底色) === "[object Array]") {
        try {
            return new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
                [colors.parseColor(底色[0]), colors.parseColor(底色[1])]);
        } catch (e) {
            诊("渐层建不出来,退回纯色:" + e);
            底色 = 底色[1];
        }
    }
    var d = new android.graphics.drawable.GradientDrawable();
    d.setColor(colors.parseColor(底色));
    return d;
}

function 装按钮(钮, 底色, 字色, 波纹色, 圆角dp) {
    try {
        var 面 = 圆角面(底色);
        面.setCornerRadius((圆角dp || 14) * 屏幕密度);
        var 背 = new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(colors.parseColor(波纹色)), 面, null);
        钮.setBackground(背);
        钮.setTextColor(colors.parseColor(字色));
        try { 钮.setStateListAnimator(null); } catch (e) {}
        try { 钮.setAllCaps(false); } catch (e) {}
    } catch (e) { 诊("装按钮出错:" + e); }   // 装不上就退回布局里那个方角背景,不影响能用
}

var 白纹 = "#40ffffff", 粉纹 = "#33e13665";
// 照 icon.png 取的色:上 #f56a97 → 下 #e13665,深色版 #c2185b 给浅底按钮和链接用
var 粉渐层 = ["#f56a97", "#e13665"], 粉深 = "#c2185b", 粉浅 = "#fdeaf1";
var 中性深 = "#5f6368";   // 次要入口用的中性深灰

function 美化按钮() {
    // 主功能(切号)用 logo 的渐层粉;次要那颗同色系浅底深字 —— 层级靠填充方式,不靠换颜色
    装按钮(ui.切签钮,     粉渐层, "#ffffff", 白纹);
    装按钮(ui.主钮,       粉浅,   粉深,      粉纹);
    // ⚠️ 查更新**不给主色**:粉色是「去表白」那颗的号召色,一个工具页的按钮抢它没道理;
    //    而且同页还有绿色的「下载并安装新版」,那才是这页真正要人点的。中性灰刚好。
    装按钮(ui.查更新钮,   "#5f6368", "#ffffff", 白纹);
    // ⚠️ 下面这几个**不跟着变粉**:它们的颜色是语义(危险红、警告橙、放行绿),
    //    不是装饰。全刷成粉色就分不出「这一步有风险」了。
    装按钮(ui.去开无障碍钮, "#b3261e", "#ffffff", 白纹);
    装按钮(ui.受限钮,     "#f57c00", "#ffffff", 白纹);
    装按钮(ui.停止钮,     "#b3261e", "#ffffff", 白纹);
    装按钮(ui.装新包钮,   "#1e8e3e", "#ffffff", 白纹);
    /*
     * 两个入口用**中性深灰**,不用粉、也不用蓝。
     * ⚠️ 跟按钮同一个粉会抢戏 —— 它们是次要导航,不是行动号召,一张卡里三处粉显得很吵。
     *    蓝色又跟整体粉色调对不上。深灰两边都不占,读起来还是「可点的字」。
     */
    try {
        ui.看版本.setTextColor(colors.parseColor(中性深));
        ui.看日志.setTextColor(colors.parseColor(中性深));
    } catch (e) {}
}

var 暂停钮色 = "";   // 只在真的换色时重画,别每秒新建一个 drawable

function 刷新状态() {
    var 开了 = 无障碍开着();
    var 跑着 = 控制.跑着;
    // 跑起来之后那两块引导没有意义了,收掉

    var 显 = android.view.View.VISIBLE, 隐 = android.view.View.GONE;
    var 悬浮 = 悬浮窗开着(), 通知 = 通知开着();
    if (跑着 && 控制条) {
        var 条文 = (控制.暂停 ? "已暂停" : 进度号) + String.fromCharCode(10) + 进度名;
        ui.run(function () {
            try {
                控制条.字.setText(条文);
                控制条.暂.setText(控制.暂停 ? "继续" : "暂停");
            } catch (e) {
                if (++条错次数 === 8) 诊("(悬浮条一直更新不了:" + e + ")");
            }
        });
    }
    ui.run(function () {
        /*
         * 收起/张开。⚠️ 无障碍没开时**强制张开**,并且把箭头藏掉 ——
         *    既然点了也不让收,就别显示成能点的。
         */
        // ⚠️ 强制张开时**不要改 展开设置 这个变量** —— 它记的是用户的选择。
        //    改了的话:无障碍关掉再开回来,用户原本收起的状态就被悄悄冲成张开了。
        //    用一个临时值表达「这一帧实际张不张」。
        var 可收 = 开了;
        var 实际张开 = 展开设置 || !可收;
        ui.设置标题行.setVisibility(跑着 ? 隐 : 显);
        ui.设置箭头.setVisibility(可收 ? 显 : 隐);
        ui.设置箭头.setText(实际张开 ? "⌄" : "›");
        ui.设置摘要.setVisibility(实际张开 ? 隐 : 显);
        if (!实际张开) {
            ui.设置摘要.setText("无障碍 " + (开了 ? "已开" : "未开")
                + " · 悬浮窗 " + (悬浮 ? "已开" : "未开")
                + " · 通知 " + (通知 ? (想要通知() ? "开" : "关") : "未开"));
        }
        ui.权限区.setVisibility((跑着 || !实际张开) ? 隐 : 显);
        ui.状态.setVisibility(跑着 ? 显 : 隐);
        写状态(ui.态无障碍, 开了);
        写状态(ui.态悬浮, 悬浮);
        /*
         * 通知行按阶段换外观:没拿到系统权限时它是一道门(跟上面两行一样),
         * 拿到之后才是我们自己的开关。
         */
        ui.通知开关.setVisibility(通知 ? 显 : 隐);
        ui.态通知.setVisibility(通知 ? 隐 : 显);
        if (通知) {
            正在同步开关 = true;
            ui.通知开关.setChecked(想要通知());
            正在同步开关 = false;
            ui.通知说明.setText(想要通知() ? "把结果发到通知栏" : "已关闭,跑完不发通知");
        } else {
            写状态(ui.态通知, false);
            ui.通知说明.setText("要先在系统里允许通知");
        }
        // 子页和主页互斥。跑起来会自动切回主页,免得进度看不见。
        if (当前页 && 跑着) 当前页 = "";
        ui.日志页.setVisibility(当前页 === "日志" ? 显 : 隐);
        ui.版本页.setVisibility(当前页 === "版本" ? 显 : 隐);
        ui.标题.setVisibility(当前页 ? 隐 : 显);
        ui.主滚动.setVisibility((!当前页 && !跑着) ? 显 : 隐);
        ui.跑动卡.setVisibility((!当前页 && 跑着) ? 显 : 隐);

        ui.结果区.setVisibility((!跑着 && 上次结果) ? 显 : 隐);
        if (!跑着 && 上次结果) ui.结果文.setText(上次结果);
        ui.滚动.setVisibility(跑着 ? 显 : 隐);        // 实时明细只在跑的时候
        ui.看日志.setVisibility(跑着 ? 隐 : 显);
        // 引导块只在「没开 + 没在跑」时出现,贴着无障碍那一行
        var 要引导 = !开了 && !跑着;
        ui.无障碍引导.setVisibility(要引导 ? 显 : 隐);
        /*
         * ⚠️ 自动展开的判据是**行为**,不是猜:「点过去开启、回来还是没开」。
         *    那正是这段提示有用的时刻,而且不会冤枉已经解锁过的人。
         *    原先按安装来源猜,结果几乎人人都被展开一大段,把界面撑得很长。
         */
        if (要引导 && 试过开无障碍 && !自动展开过) { 自动展开过 = true; 展开受限 = true; }
        ui.受限详情.setVisibility(展开受限 ? 显 : 隐);
        ui.受限标题.setText("开关是灰的、点不动? " + (展开受限 ? "⌄" : "›"));
        /*
         * ⚠️ 主钮在没开无障碍时**整个藏起来**,不再变成「去开启无障碍」——
         *    那会跟引导块里的按钮重复,而且位置隔着两行,用户不知道该点哪个。
         */
        ui.主钮.setVisibility((跑着 || !开了) ? 隐 : 显);
        ui.切签钮.setVisibility((跑着 || !开了) ? 隐 : 显);
        ui.控制条.setVisibility(跑着 ? 显 : 隐);

        if (跑着) {
            ui.状态.setText((控制.暂停 ? "已暂停 " : "表白中 ") + 进度号
                + (进度名 ? " · " + 进度名 : ""));
            ui.状态.setTextColor(colors.parseColor(控制.暂停 ? "#8a5300" : "#12496b"));
            ui.状态.setBackgroundColor(colors.parseColor(控制.暂停 ? "#fff4e5" : "#e3f0f8"));
            ui.暂停钮.setText(控制.暂停 ? "继续" : "暂停");
            var 暂色 = 控制.暂停 ? "#1e8e3e" : "#f57c00";
            if (暂色 !== 暂停钮色) { 暂停钮色 = 暂色; 装按钮(ui.暂停钮, 暂色, "#ffffff", 白纹); }
        }
        ui.主钮.setText("开始表白(单号)");
    });
    return 开了;
}

var 正在同步开关 = false;

ui.通知开关.on("check", function (勾上) {
    if (正在同步开关) return;          // 这是代码自己 setChecked 触发的,不是用户点的
    记住要通知(勾上);
    if (勾上 && !通知开着()) 要通知权限();
});

/*
 * ── 版本信息页 ──
 * 回答两个问题:现在跑的是哪一份脚本、以及「我要立刻更新」。
 * 加载器把检查结果写在 SharedPreferences 里,这里直接读 ——
 * 不依赖加载器的全局对象,因为脚本也可能被 AutoJs6 直接跑,那时根本没有加载器。
 */
function 读加载器偏好(键, 默认值) {
    try {
        return String(context.getSharedPreferences("loader", 0).getString(键, 默认值));
    } catch (e) { return 默认值; }
}

function 多久之前(毫秒) {
    var 分 = Math.floor((Date.now() - 毫秒) / 60000);
    if (分 < 1) return "刚刚";
    if (分 < 60) return 分 + " 分钟前";
    var 时 = Math.floor(分 / 60);
    if (时 < 24) return 时 + " 小时前";
    return Math.floor(时 / 24) + " 天前";
}

function 画版本页() {
    var 行分 = String.fromCharCode(10);
    var 包版本 = "?", 包版本号 = "?";
    try {
        var 包 = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        包版本 = String(包.versionName); 包版本号 = String(包.versionCode);
    } catch (e) {}
    var 来源 = 读加载器偏好("本次来源", "") || "(没有加载器,可能是直接跑的脚本)";
    var 何时 = "(还没查过)";
    try {
        var t = parseInt(读加载器偏好("上次查时间", "0"), 10);
        if (t) 何时 = 时间戳(new Date(t)) + "  ·  " + 多久之前(t);
    } catch (e) {}
    /*
     * 有没有新的安装包。加载器查更新时把清单里的 APK 信息记进了偏好。
     * ⚠️ 比的是 versionCode 不是版本名 —— 版本名是给人看的字符串,"0.1.10" < "0.1.9"
     *    这种比较会错;versionCode 是整数,Android 自己也是按它判断能不能升级。
     */
    var 新包提示 = "";
    try {
        var 远号 = parseInt(读加载器偏好("远程APK版本号", "0"), 10) || 0;
        var 本号 = parseInt(包版本号, 10) || 0;
        if (远号 > 本号) {
            新包提示 = 行分 + "          ⚠️ 有新版安装包 "
                     + 读加载器偏好("远程APK版本名", "?")
                     + "(versionCode " + 远号 + ")";
        }
    } catch (e) {}

    /*
     * 操作的是哪个腾讯视频。出问题时这是最有用的一行 ——
     * 脚本认的是那个 App 的页面名和界面文字,版本一变就可能不灵。
     */
    var 候选 = 定腾讯包();
    var 腾讯行 = "(没找到能处理 txvideo:// 的应用)";
    if (候选.length) {
        for (var qi = 0; qi < 候选.length; qi++) {
            if (候选[qi].包名 === 腾讯包) {
                腾讯行 = 候选[qi].名字 + " " + 候选[qi].版本 + 行分
                       + "          " + 候选[qi].包名;
            }
        }
        if (候选.length > 1) 腾讯行 += 行分 + "          (系统里有 " + 候选.length + " 个候选)";
    }

    var 文 = "应用      小菇爱表白" + 行分
           + "包名      " + context.getPackageName() + 行分
           + "安装包    " + 包版本 + "(versionCode " + 包版本号 + ")" + 新包提示 + 行分 + 行分
           + "脚本      " + 构建标记 + 行分
           + "来源      " + 来源 + 行分 + 行分
           + "上次检查  " + 何时 + 行分
           + "结果      " + 读加载器偏好("上次查结果", "(还没查过)") + 行分 + 行分
           + "操作对象  " + 腾讯行;
    ui.run(function () {
        ui.装新包钮.setVisibility(新包提示 ? android.view.View.VISIBLE : android.view.View.GONE);
        ui.换腾讯.setVisibility(候选.length > 1 ? android.view.View.VISIBLE : android.view.View.GONE);
        ui.版本正文.setText(文);
        ui.查更新说明.setText("每 6 小时自动查一次;点上面的按钮可以立刻查,不受这个限制。"
                           + 行分 + "查到新版要重开 App(从最近任务划掉再打开)才生效。");
    });
}

ui.看版本.on("click", function () { 当前页 = "版本"; 画版本页(); 刷新状态(); });
ui.版本返回.on("click", function () { 当前页 = ""; 刷新状态(); });

ui.查更新钮.on("click", function () {
    if (typeof 加载 === "undefined" || !加载.开后台查更新) {
        toast("这份脚本不是通过加载器跑的,没有更新功能");
        return;
    }
    var 旧时间 = 读加载器偏好("上次查时间", "0");
    ui.查更新说明.setText("正在检查…");
    加载.开后台查更新();
    /*
     * ⚠️ 不能在这儿等结果 —— 查更新跑在后台线程,这里是 UI 线程,等就卡死界面。
     *    改成轮询偏好:加载器查完会写新的时间戳,时间戳变了就说明有结论了。
     */
    var 次 = 0;
    var 表 = setInterval(function () {
        次++;
        if (读加载器偏好("上次查时间", "0") !== 旧时间) {
            clearInterval(表);
            画版本页();
            toast(读加载器偏好("上次查结果", ""));
        } else if (次 > 40) {                 // 20 秒还没结论,当它超时
            clearInterval(表);
            ui.查更新说明.setText("检查超时,可能是网络不通,稍后再试。");
        }
    }, 500);
});

/*
 * ── 下载并安装新安装包 ──
 * ⚠️ REQUEST_INSTALL_PACKAGES 是**特殊权限**,给不了自己,也没法用 requestPermissions 弹框。
 *    只能把用户送到系统的「安装未知应用」页面,他自己打开。
 *    跟无障碍、悬浮窗一样,App 只能送到门口。
 */
function 能装包() {
    try {
        if (android.os.Build.VERSION.SDK_INT < 26) return true;
        return context.getPackageManager().canRequestPackageInstalls();
    } catch (e) { return false; }
}

function 去开安装权限() {
    try {
        var it = new android.content.Intent(
            android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            android.net.Uri.parse("package:" + context.getPackageName()));
        it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(it);
    } catch (e) { toast("打不开安装权限设置:" + e); }
}

/** 把下载好的 APK 交给系统安装器。Android 7+ 必须用 content:// —— file:// 会抛 FileUriExposedException */
function 拉起安装(路径) {
    try {
        var f = new java.io.File(路径);
        if (!f.exists()) { toast("安装包不见了,重新下载"); return; }
        var uri = androidx.core.content.FileProvider.getUriForFile(
            context, context.getPackageName() + ".fileprovider", f);
        var it = new android.content.Intent(android.content.Intent.ACTION_VIEW);
        it.setDataAndType(uri, "application/vnd.android.package-archive");
        it.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                  | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(it);
    } catch (e) {
        toast("拉不起安装器:" + e);
        诊("拉起安装失败:" + e);
    }
}

ui.装新包钮.on("click", function () {
    if (typeof 加载 === "undefined" || !加载.开后台下载) {
        toast("这份脚本不是通过加载器跑的,没有更新功能");
        return;
    }
    if (!能装包()) {
        dialogs.build({
            title: "需要「安装未知应用」权限",
            content: "下一页请把「小菇爱表白」的开关打开,然后按返回键回来再点一次。"
                   + String.fromCharCode(10) + String.fromCharCode(10)
                   + "这个权限只用来安装本应用自己的更新包,不点这个按钮就永远用不到。",
            positive: "去开启", negative: "算了"
        }).on("positive", function () { 去开安装权限(); }).show();
        return;
    }
    ui.装新包钮.setText("准备下载…");
    加载.存("下载状态", "");
    加载.开后台下载();
    /*
     * 同样不能在 UI 线程等 —— 下载跑在后台线程,这里轮询偏好里的「下载状态」。
     * 56 MB 慢的话要几十秒,所以给到 5 分钟。
     */
    var 次 = 0;
    var 表 = setInterval(function () {
        次++;
        var 态 = 读加载器偏好("下载状态", "");
        if (态 === "就绪") {
            clearInterval(表);
            ui.装新包钮.setText("下载并安装新版");
            拉起安装(加载.新包路径);
        } else if (态.indexOf("失败") === 0) {
            clearInterval(表);
            ui.装新包钮.setText("下载并安装新版");
            dialogs.build({ title: "下载没成功", content: 态, positive: "知道了" }).show();
        } else if (态) {
            ui.装新包钮.setText(态);
        }
        if (次 > 600) {                       // 5 分钟
            clearInterval(表);
            ui.装新包钮.setText("下载并安装新版");
            toast("下载超时");
        }
    }, 500);
});

ui.换腾讯.on("click", function () {
    var 候选 = 腾讯候选();
    if (候选.length < 2) { toast("系统里只有一个,没得选"); return; }
    var 项 = 候选.map(function (c) {
        return c.名字 + "  " + c.版本 + String.fromCharCode(10) + c.包名
             + (c.包名 === 腾讯包 ? "  ← 正在用" : "");
    });
    dialogs.select("用哪个腾讯视频?", 项).then(function (i) {
        if (i < 0) return;
        腾讯包 = 候选[i].包名;
        try { if (偏好) 偏好.put("腾讯包", 腾讯包); } catch (e) {}
        诊("用户手动选了 " + 腾讯包);
        画版本页();
        toast("已改用 " + 候选[i].名字);
    });
});

ui.看日志.on("click", function () { 去看日志(); });

ui.日志返回.on("click", function () { 当前页 = ""; 刷新状态(); });
ui.日志诊断.on("click", function () { 看诊断 = !看诊断; 画日志页(); });
ui.日志清空.on("click", function () {
    dialogs.build({ title: "清空日志?", content: "只清记录,不影响已经表白的结果。",
                    positive: "清空", negative: "算了" })
        .on("positive", function () {
            try { files.write(日志档, ""); } catch (e) {}
            行.length = 0; 画日志页(); toast("日志已清空");
        }).show();
});
ui.关结果.on("click", function () {
    上次结果 = "";
    try { if (偏好) 偏好.put("上次结果", ""); } catch (e) {}
    刷新状态();
});
ui.行无障碍.on("click", function () { 试过开无障碍 = true; 去开无障碍(); });
ui.去开无障碍钮.on("click", function () { 试过开无障碍 = true; 去开无障碍(); });
ui.受限标题.on("click", function () { 展开受限 = !展开受限; 刷新状态(); });
ui.设置标题行.on("click", function () {
    // 无障碍没开就不让收 —— 理由见布局里那段注释
    if (!无障碍开着()) { toast("先把无障碍开起来,这块才能收"); return; }
    展开设置 = !展开设置;
    try { if (偏好) 偏好.put("设置展开", 展开设置); } catch (e) {}
    刷新状态();
});
ui.行悬浮.on("click", function () { 求悬浮窗(); });
/*
 * 没拿到系统权限时,整行可点 —— 那时它显示的是「未开启 ›」,跟上面两行同一个语义。
 * 拿到权限之后这一行的交互交给 Switch,点行本身不做事(免得误触切换)。
 */
ui.行通知.on("click", function () { if (!通知开着()) 要通知权限(); });


ui.暂停钮.on("click", function () {
    控制.暂停 = !控制.暂停;
    刷新状态();
    toast(控制.暂停 ? "做完手上这个角色就停" : "继续");
});

ui.停止钮.on("click", function () {
    控制.中止 = true;
    控制.暂停 = false;        // 正卡在暂停里的话,放它出来去看中止标志
    toast("正在停止…");
});

/** 两个按钮共用的开跑流程。任务名只用来写日志。 */
function 开跑(任务名, 任务) {
    if (控制.跑着) return;
    行 = [];
    当前账号名 = ""; 轮次前缀 = "";     // 用户可能手动切过号,重新认一次
    控制.跑着 = true; 控制.暂停 = false; 控制.中止 = false;
    进度号 = ""; 进度名 = 任务名;
    开控制条();
    刷新状态();
    threads.start(function () {
        try {
            /*
             * ⚠️ 认准操作对象这一步必须在**所有任务之前**做,而且要在这个统一入口做。
             *    原先放在 跑一轮() 里,多账号模式就漏了 —— 跑全部账号() 会先调
             *    开切号面板() 发深链,那时 腾讯包 还是默认值。
             *    本机默认值恰好正确所以没暴露,换台手机(国际版、改过名的包)就会打错 App。
             */
            var 候选 = 定腾讯包();
            if (!候选.length) {
                记("✗ 找不到能处理 txvideo:// 的应用 —— 腾讯视频没装?");
                toast("没装腾讯视频");
                return;
            }
            var 这个 = null;
            for (var ci = 0; ci < 候选.length; ci++) if (候选[ci].包名 === 腾讯包) 这个 = 候选[ci];
            诊("操作对象:" + (这个 ? 这个.名字 + " " + 这个.版本 : "?") + "(" + 腾讯包 + ")"
               + (候选.length > 1 ? ",另有 " + (候选.length - 1) + " 个候选" : ""));

            任务();
        }
        catch (e) {
            if (e === 中止信号) 记("■ 用户中止");
            else 记("✗ 出错:" + e);
        }
        finally { 控制.跑着 = false; 进度号 = ""; 进度名 = ""; 关控制条(); 刷新状态(); }
    });
}

ui.切签钮.on("click", function () {
    if (控制.跑着) return;
    if (!刷新状态()) { 去开无障碍(); return; }
    开跑("APP内切号", function () {
        // 切换列表里的每个号都切过去、各跑一轮表白。**真点**。
        跑全部账号(跑一轮);
    });
});

ui.主钮.on("click", function () {
    if (控制.跑着) return;
    if (!刷新状态()) {
        记("auto.service=" + (function () {
            try { return String(auto.service); } catch (e) { return "读取出错 " + e; }
        })());
        去开无障碍();
        return;
    }
    开跑("", function () {
        进度号 = "0/" + 配置.角色.length;
        if (配置.多账号) 跑全部账号(跑一轮); else 跑一轮();
    });
});

/*
 * 每秒重新看一次状态。
 * ⚠️ 光靠 resume 事件不够 —— 用户从设置页回来的那一刻,系统可能还没把服务绑上,
 *    那时候读到的还是「没开」。定时轮询能把这几百毫秒的空档接住。
 */
/*
 * 启动就把通知渠道建好。见 建通知渠道() 上面那段:targetSdk 29 的 App 在 Android 13+
 * 上,系统是在「建完渠道后第一次启动 Activity」才弹授权框 —— 建得越早,框来得越早,
 * 也就不会在跑完那一刻打断用户了。
 */
/*
 * ⚠️ 「在不在前台」只能靠 Activity 生命周期事件,**不能用 currentPackage()** ——
 *    那个要无障碍服务,而这段场景恰恰是无障碍没开的时候。
 */
try {
    // 回到本应用 = 引导那批 toast 该闭嘴了(步骤在页面上写着,不用再弹)
    ui.emitter.on("resume", function () { 引导批次++; });
} catch (e) {
    诊("接不上 resume 事件:" + e);
}

/*
 * 手机的返回键 / 返回手势。
 *
 * ⚠️ 「版本信息」「运行日志」**不是独立 Activity** —— 它们是同一个 layout 里的两块,
 *    靠显示/隐藏切换(铁律:manifest 远程更新改不了,所以不新开 Activity)。
 *    代价就是**系统不知道「现在在子页」**:默认的返回 = 关掉整个 Activity = 退出 App,
 *    用户在子页一划就直接退到桌面,只能点左上角那个「返回」,完全不符合直觉。
 * 所以自己接管:有子页就先回主页,并且**把事件吃掉**(e.consumed = true);
 * 在主页则不拦,让系统照常退出。
 */
try {
    ui.emitter.on("back_pressed", function (e) {
        if (当前页) {
            当前页 = "";
            刷新状态();
            e.consumed = true;
        }
    });
} catch (e) {
    诊("接不上 back_pressed 事件:" + e);
}

刷新状态();
setInterval(刷新状态, 1000);



// 启动时记一次环境,方便用户报问题时判断是哪一种情况(受限设置?装法?系统版本?)
(function 记环境() {
    var 来源 = String(安装来源());
    诊("构建 " + 构建标记);
    诊("环境:Android " + android.os.Build.VERSION.RELEASE
        + " (SDK " + android.os.Build.VERSION.SDK_INT + ")"
        + " · 安装来源 " + 来源
        + " · 可能被受限设置挡 " + 可能被受限设置挡()
        + " · 无障碍 " + (无障碍开着() ? "开" : "关"));
})();

// ══════════════ 以下是签到逻辑(已在真机验证过)══════════════

/*
 * ── 结果通知 ──
 * 跑的过程中屏幕上是腾讯视频,我们的界面在后台,用户看不到进度。
 * 跑完发一条通知,补上「跑完了、成了几个」这个空白。
 * ⚠️ 这条是**结果留痕**,不是「正在操控」的提示 —— 后者要常驻通知或悬浮窗,另说。
 */
/**
 * 让用户把系统通知权限打开。
 *
 * 【为什么不用系统的运行时对话框(别的 App 都是那样的)】
 *   因为**我们的 targetSdk 是 29**(继承自 AutoJs6 的 inrt 模板,改不了)。
 *   `POST_NOTIFICATIONS` 只对 **targetSdk ≥ 33** 的 App 才算「运行时权限」;
 *   对旧目标的 App,`activity.requestPermissions(...)` 是**空操作** ——
 *   不报错、不弹框、`dumpsys` 里连 GrantPermissionsActivity 都不会出现。
 *   (查这个费了不少劲:没异常、没日志,看起来就像「系统不让弹」。
 *    中途还怀疑过是 JS 数组没转成 Java String[]、是 AutoJs6 的 Activity 吞了 ——
 *    都不是。)
 *   别的 App 能在应用内弹框,是因为它们 target 33+。
 *
 * 所以直接跳到**本应用自己的通知设置页**(不是通用设置列表,一步到位)。
 */
function 要通知权限() {
    var 目标 = 29;
    try { 目标 = context.getApplicationInfo().targetSdkVersion; } catch (e) {}
    if (目标 >= 33) {
        // 万一哪天 targetSdk 提上去了,这条就自动生效
        try {
            var 要的 = java.lang.reflect.Array.newInstance(java.lang.String, 1);
            要的[0] = "android.permission.POST_NOTIFICATIONS";
            activity.requestPermissions(要的, 1001);
            return;
        } catch (e) { 诊("(申请通知权限出错:" + e + ")"); }
    }
    toast("请打开「通知を許可 / 允许通知」");
    去开通知();
}

/*
 * ⚠️ 下面这条路是**兜底**,不是首选。
 *
 * 试过两个位置,都不行:
 *   放在点「开始签到」那一下 → 弹窗开在我们自己的任务栈里,可一秒后脚本就发深链
 *      把腾讯拉到前台,弹窗被压到后台没人答;**整轮跑完把 App 切回前台时它才浮上来**,
 *      看起来像「跑完了弹个莫名其妙的框」。
 *   放在开 App 时(延后 800ms / 2500ms 都试过)→ 请求发出去了、不报错,
 *      但弹窗**刚出来就被关掉**(`dumpsys` 里 `GrantPermissionsActivity … t-1`)。
 *      AutoJs6 启动时自己在 SplashActivity / ScriptExecuteActivity / LogActivity 之间切,
 *      把它顶没了。
 *
 * 所以改成跟「无障碍」「悬浮窗」一样的做法:界面上给一行可点的提示,跳系统设置页。
 * 确定性的,不跟任何时序赛跑。
 */
/*
 * ── 通知的两层 ──
 *   ① 系统权限 POST_NOTIFICATIONS —— Android 13+ 必须用户同意,App 给不了自己
 *   ② App 自己的偏好「跑完发不发」 —— 这层是我们的,存本地
 * 界面上的开关表示的是「① 和 ② 都满足」,也就是「跑完真的会收到通知」。
 */
var 偏好 = (function () {
    // ⚠️ 这个 id 是**存储键**,不是显示名,别跟着应用名改 ——
    //    改了等于换一个存储区,用户已存的设置(通知开关、问过通知、上次结果)全丢。
    try { return storages.create("checkin_prefs"); } catch (e) { return null; }
})();
function 想要通知() {
    try { return 偏好 ? 偏好.get("通知", true) : true; } catch (e) { return true; }
}
function 记住要通知(要) {
    try { if (偏好) 偏好.put("通知", !!要); } catch (e) {}
}

/*
 * 通知到底能不能发。
 *
 * ⚠️ **不要用 checkSelfPermission(POST_NOTIFICATIONS)** —— 对 targetSdk < 33 的应用
 *    (我们是 29,inrt 模板给的,改不了)框架会把这个权限**自动授予**,免得老应用崩,
 *    于是它永远返回「已授权」,而实际上系统里通知是关的(importance=NONE)。
 *    实测:dumpsys 显示 granted=false、importance=NONE,checkSelfPermission 却说 0(已授权),
 *    结果界面把「一道门」画成了「真开关」。
 *
 * areNotificationsEnabled() 才是权威判据,API 24 起就有,跟 targetSdk 无关。
 */
function 通知开着() {
    try {
        var NM = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        return !!NM.areNotificationsEnabled();
    } catch (e) { return true; }   // 问不出来就别烦用户
}

/*
 * 送去系统的无障碍设置。App 只能送到这一步,开关得用户自己按。
 *
 * ⚠️⚠️ **这里曾经浮一张悬浮卡片把步骤显示在系统设置上面,已经彻底拿掉,别再加回来。**
 *    不是「修不好」,是这条路根本走不通,两个独立的原因:
 *
 *    ① **在 UI 线程里调 `floaty.rawWindow()` 必然死锁。** 它内部要 post 到 UI 线程
 *       建窗口再等结果,而调用它的就是按钮的点击回调 —— 自己等自己。
 *       症状极具迷惑性:日志停在「开始创建」那一行,**不报错、不超时**,
 *       `dumpsys window` 里也根本没有这个窗口,而**整个 App 界面冻死**
 *       (uiautomator 连控件都读不出来)。查了三轮才定位到。
 *       这也解释了用户最早看到的「多了个关不掉的黑框、返回后不消失、layout 崩了」。
 *
 *    ② **就算改到后台线程建得出来,系统也不给看。** Android 12 起系统设置的无障碍页
 *       会主动隐藏悬浮窗(防点击劫持),部分机型还会因为「检测到悬浮窗」直接拒绝
 *       打开无障碍开关 —— 悬浮窗在这一页帮不上忙,只会帮倒忙。
 *
 *    替代方案就是下面两条:**深链直接跳到本应用那一行** + **toast 轮播**。
 */

/*
 * 深链到本应用自己的无障碍开关页,省掉「在长列表里翻」这一步。
 *
 * `:settings:fragment_args_key` 是 AOSP 设置里的老约定:传一个控件 key 进去,
 * 设置会滚到它并高亮。无障碍列表这里的 key 就是服务的 ComponentName 字符串。
 * ⚠️ 各家 ROM 支持程度不一(Samsung One UI 不保证),所以它只是**锦上添花**:
 *    不认的话就是普通的无障碍首页,后面的 toast 轮播照样管用,不能依赖它成功。
 *
 * ⚠️ 服务类名**不要写死** —— inrt 模板升级过就对不上了,而且写死了不报错、只是不高亮,
 *    属于「坏了也不知道」。问系统要:已安装的无障碍服务里找包名是自己的那个。
 */
function 本应用无障碍服务名() {
    try {
        var AM = context.getSystemService(android.content.Context.ACCESSIBILITY_SERVICE);
        var 全 = AM.getInstalledAccessibilityServiceList();
        var 我 = context.getPackageName();
        for (var i = 0; i < 全.size(); i++) {
            var id = String(全.get(i).getId());
            if (id.indexOf(我 + "/") === 0) return id;
        }
    } catch (e) { 诊("查无障碍服务名出错:" + e); }
    return "";
}

/*
 * 在系统设置里循环提示步骤。
 *
 * ⚠️ 为什么是**轮播**不是一条:单条 toast 只亮两三秒,用户反馈「一下就没了看不太到」。
 *    这里一次一条、每 3.5 秒换一条(长 toast 约 3.5 秒),三步循环两遍 ≈ 21 秒,
 *    足够从设置首页翻到应用列表。
 * ⚠️ 用 setTimeout(UI 线程)排期,**不要开后台线程** —— AutoJs6 的 API 在后台线程会挂死。
 * ⚠️ 两个自动闭嘴的条件都要留:批次过期(又点了一次,**或者人已经回到 App**)、已经开好了。
 *    少一个就会出现「已经开完了还在弹」这种像 bug 的体验。
 * ⚠️ **不要用 `ui.emitter.on("pause")` 判在不在前台** —— 试过,这个事件在 inrt 打包版里
 *    不触发(或触发不到脚本这层),于是「在前台」永远是 true,六条 toast **一条都不弹**,
 *    而且不报错。只用 resume 这一个已知可靠的事件,让它去作废批次。
 */
function 轮播步骤() {
    var 步 = ["① 点「已安装的应用」",
             "② 往下找「小菇爱表白」",
             "③ 打开它的开关"];
    引导批次++;
    var 本批 = 引导批次;
    for (var i = 0; i < 6; i++) {
        (function (n) {
            setTimeout(function () {
                // ⚠️ 这些早退都要留痕:「toast 一条没出现」时,没日志就只能靠猜
                if (本批 !== 引导批次) { if (n === 0) 诊("轮播:批次过期,不弹"); return; }
                if (无障碍开着()) { if (n === 0) 诊("轮播:已开好,不弹"); return; }
                try { toast(步[n % 步.length]); if (n === 0) 诊("轮播:第一条已发"); }
                catch (e) { 诊("轮播 toast 出错:" + e); }
            }, n * 3500);
        })(i);
    }
}

function 去开无障碍() {
    try {
        var 设置 = new android.content.Intent(
            android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
        设置.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        var 服务名 = 本应用无障碍服务名();
        if (服务名) {
            var 参数 = new android.os.Bundle();
            参数.putString(":settings:fragment_args_key", 服务名);
            设置.putExtra(":settings:fragment_args_key", 服务名);
            设置.putExtra(":settings:show_fragment_args", 参数);
        }
        context.startActivity(设置);
        诊("去开无障碍:已跳到系统无障碍设置页" + (服务名 ? " · 带定位 " + 服务名 : " · 没查到服务名"));
        轮播步骤();
    } catch (e) {
        诊("去开无障碍出错:" + e);      // ⚠️ 以前只 toast 不记日志,出了事查不到
        toast("打不开无障碍设置:" + e);
    }
}

/*
 * 首次启动时主动问一次通知权限。
 *
 * ⚠️ 为什么非得自己问:targetSdk 29 在 Android 13+ 上,requestPermissions() 是**静默空操作**,
 *    系统改成自己挑时机弹 —— 时机是「建完通知渠道之后的下一次 Activity 启动」。
 *    我们跑完会把 App 拉回前台,那正好就是「下一次 Activity 启动」,
 *    于是框永远落在**跑完那一刻**,还顺手把那一轮的通知静默丢掉。实测确认过两次。
 *    改成启动就建渠道也没用(建渠道时 Activity 已经起来了,触发点还是落到下一次)。
 *    所以别跟系统的隐式时机较劲:自己在启动时问,问完直接送去本应用的通知设置页。
 *
 * 只问一次(记在偏好里),用户说不要就再也不烦他。
 */
function 首次问通知() {
    if (!想要通知()) return;              // 开关本来就是关的,不用问
    if (通知开着()) return;               // 已经有权限了
    try { if (偏好 && 偏好.get("问过通知", false)) return; } catch (e) {}
    try { if (偏好) 偏好.put("问过通知", true); } catch (e) {}
    ui.run(function () {
        dialogs.build({
            title: "开启通知?",
            // 这里刻意不写反斜杠转义:改本文件的工具链会把转义吞成真换行,
            // 而 JS 字符串不能跨行 —— 脚本会解析失败、一打开就闪退(踩过)。
            content: "跑完会把「新表白几个、失败几个」发到通知栏。" +
                     String.fromCharCode(10) + String.fromCharCode(10) +
                     "下一页请打开「通知を許可 / 允许通知」,然后按返回键回来。",
            positive: "去开启",
            negative: "不用",
            cancelable: false
        }).on("positive", function () { 去开通知(); })
          .on("negative", function () { 记住要通知(false); 刷新状态(); })
          .show();
    });
}

/*
 * 回到**我们自己的界面**。
 *
 * ⚠️ 别用 getLaunchIntentForPackage() —— 那是「点桌面图标」那条路,会进 inrt 的
 *    SplashActivity;它看脚本已经在跑,就把人带去 AutoJs6 自带的 LogActivity
 *    (原始控制台)。用户的原话是「这是系统的页面?我在 APP 里找不到」。
 *    直接指名当前 Activity 的类,配 REORDER_TO_FRONT|SINGLE_TOP 把已有的那个提到前台,
 *    不新建实例 —— 新建会让 inrt 再跑一遍脚本。
 */
function 本应用界面Intent() {
    var it = null;
    try { it = new android.content.Intent(context, activity.getClass()); } catch (e) {}
    if (!it) it = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
              | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
              | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return it;
}
function 回本应用() {
    try { context.startActivity(本应用界面Intent()); } catch (e) {}
}

/*
 * 看运行日志 —— 切到同一个 layout 里的「日志页」,读我们自己写的 checkin_log.txt。
 *
 * ⚠️ 不要跳 AutoJs6 自带的 org.autojs.autojs.inrt.LogActivity。那一页右上角有个 ⋮,
 *    通向模板自带的 SettingsActivity —— 那是**第二套权限界面**,措辞是机翻的
 *    (通知那项显示成「ゆうびんけいほう」),而且对我们这个包有几项是坏的或有害的:
 *      · 全ファイルアクセス  → MANAGE_EXTERNAL_STORAGE 已从 manifest 删掉,开了没用
 *      · 起動したとき        → RECEIVE_BOOT_COMPLETED 也不在,同样没用
 *      · メインのアクティビティが表示されない → 误点之后我们自己的界面就不出来了
 *    模板里那个 ⋮ 菜单是编译进去的,脚本改不掉 —— 所以唯一的办法是**根本别把用户领过去**。
 */
function 画日志页() {
    var 全 = 行;
    if (!全.length) {                                  // 界面重启过,内存里没有,回头读文件
        try { 全 = (files.exists(日志档) ? files.read(日志档) : "").split(换行符); } catch (e) { 全 = []; }
    }
    var 要显示 = 看诊断 ? 全 : 全.filter(function (l) { return l.indexOf(诊断标记) < 0; });
    var 留 = 要显示.slice(Math.max(0, 要显示.length - 300));
    var 抬头 = (要显示.length > 留.length ? "(共 " + 要显示.length + " 行,显示最后 " + 留.length + " 行)" + 换行符 + 换行符 : "");
    ui.run(function () {
        ui.日志诊断.setText(看诊断 ? "隐藏诊断" : "显示诊断");
        ui.日志全文.setText(抬头 + (留.join(换行符) || "(还没有日志)"));
        ui.日志滚动.post(function () { ui.日志滚动.fullScroll(android.view.View.FOCUS_DOWN); });
    });
}

function 去看日志() {
    当前页 = "日志";
    画日志页();
    刷新状态();
}

function 去开通知() {
    try {
        var it = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        it.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.getPackageName());
        it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(it);
    } catch (e) {
        toast("打不开通知设置:" + e);
    }
}

var 通知渠道 = "checkin_result";

/*
 * 建通知渠道。**必须在 App 一启动就调**,不能等到要发通知时才建。
 *
 * ⚠️ 本 App targetSdk 29(inrt 模板给的,改不了)。Android 13+ 对 targetSdk ≤ 32 的 App
 *    不走 requestPermissions() —— 那个调用是**静默空操作**。系统自己挑时机弹授权框,
 *    时机是「建完渠道之后第一次启动 Activity」。
 *    渠道原来是懒建的(躲在 发结果通知 里),于是:跑完 → 建渠道 → App 拉回前台
 *    → 授权框在**最后一刻**蹦出来,而那条通知因为当时还没授权被**静默丢掉**。
 *    改成启动就建,框就在首次打开 App 时出现,第一轮的通知也就发得出去了。
 */
function 建通知渠道() {
    if (android.os.Build.VERSION.SDK_INT < 26) return;
    // 没渠道系统就永远不会弹那个框。用户把开关关了就别建,免得白弹。
    if (!想要通知()) return;
    try {
        var NM = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        NM.createNotificationChannel(new android.app.NotificationChannel(
            // ⚠️ 改的是渠道**显示名**。渠道 id(通知渠道 = "checkin_result")是**存储键**,
            //    绝对不能跟着文案改 —— 换了 id 等于建一个新渠道,用户之前对它做的设置
            //    (关掉、静音、改重要性)全部作废,而且旧渠道还会留在系统设置里。
            通知渠道, "表白结果", android.app.NotificationManager.IMPORTANCE_DEFAULT));
    } catch (e) {}
}

function 发结果通知(标题, 正文) {
    if (!想要通知()) return;      // 用户在界面上把开关关了
    try {
        var NM = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        var 渠道 = 通知渠道;
        var 建;
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            建通知渠道();                       // 幂等,补一手(用户可能在设置里删过渠道)
            建 = new android.app.Notification.Builder(context, 渠道);
        } else {
            建 = new android.app.Notification.Builder(context);
        }
        // 点通知回到**我们的界面**(不是 AutoJs6 的日志页,见 本应用界面Intent)
        var 回 = 本应用界面Intent();
        var 旗 = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 31) 旗 |= android.app.PendingIntent.FLAG_IMMUTABLE;
        建.setContentTitle(标题)
          .setContentText(正文)
          .setStyle(new android.app.Notification.BigTextStyle().bigText(正文))
          .setSmallIcon(context.getApplicationInfo().icon)
          .setAutoCancel(true)
          .setContentIntent(android.app.PendingIntent.getActivity(context, 0, 回, 旗));
        NM.notify(1001, 建.build());
        try {
            var 活 = NM.getActiveNotifications();
            诊("(通知已发出,当前活动通知 " + (活 ? 活.length : "?") + " 条)");
        } catch (e2) {}
    } catch (e) {
        诊("(通知发不出来:" + e + ")");
    }
}

/** 深链:直接跳到某个页面,不用一层层点进去 */
function 开深链(url) {
    var it = new android.content.Intent(android.content.Intent.ACTION_VIEW,
        android.net.Uri.parse(url));
    it.setPackage(腾讯包);
    it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
    context.startActivity(it);
}

function 等到前台(包名, 超时毫秒) {
    var 截止 = Date.now() + 超时毫秒;
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;        // 停止要立刻响应,不等这一轮超时
        if (currentPackage() === 包名) return true;
        sleep(300);
    }
    return false;
}

function 等Activity(关键字, 超时毫秒) {
    var 截止 = Date.now() + 超时毫秒;
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        var a = currentActivity() || "";
        if (a.indexOf(关键字) >= 0) return true;
        sleep(300);
    }
    return false;
}

/**
 * 找表白按钮。
 * ⚠️ 坐标绝对不能写死 —— 同一个角色页,深链进来按钮在 (933,349),
 *    从演员页点进来在 (933,915)。位置随进入方式变,每次现读 bounds()。
 * ⚠️ 这个按钮 clickable=false、class=TextView,o.click() 没用,必须按坐标点。
 */
/**
 * 节点在不在屏幕上。
 *
 * ⚠️ 这个检查是必须的,不是保险。实测踩过:
 *     [06:18:13]   点 (1994,349)      ← 屏幕只有 1080 宽
 *   `text("我要表白").findOnce()` 返回了一个**屏幕外**的节点 ——
 *   角色页里有横向排版的容器,旁边那一屏的按钮也在控件树里,只是没显示出来。
 *   于是点了个空,日志报「点了但没变成已表白」,看起来像腾讯改版或者点击失效,
 *   实际是我们自己点到屏幕外去了。前三个角色都正常(x=933),第四个才撞上。
 */
function 在屏幕上(o) {
    if (!o) return false;
    try {
        var b = o.bounds();
        if (b.width() <= 0 || b.height() <= 0) return false;
        if (b.centerX() < 0 || b.centerX() > device.width) return false;
        if (b.centerY() < 0 || b.centerY() > device.height) return false;
    } catch (e) { return false; }
    try { if (typeof o.visibleToUser === "function" && !o.visibleToUser()) return false; } catch (e) {}
    return true;
}

/** 同名节点可能有好几个(屏幕外的也在树里),挑第一个真在屏幕上的 */
function 找可见(选择器) {
    try {
        var 全 = 选择器.find();
        for (var i = 0; i < 全.size(); i++) {
            var o = 全.get(i);
            if (在屏幕上(o)) return o;
        }
    } catch (e) {}
    return null;
}

/** 读一次:屏幕上那个表白按钮现在是什么状态。读不到返回 null。 */
function 读表白钮() {
    var o = 找可见(text("我要表白"));
    if (o) return { 文案: "我要表白", 框: o.bounds() };
    o = 找可见(text("已表白"));
    if (o) return { 文案: "已表白", 框: o.bounds() };
    return null;
}

function 找表白钮(超时毫秒) {
    var 截止 = Date.now() + 超时毫秒;
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        var r = 读表白钮();
        if (r) return r;
        sleep(400);
    }
    return null;
}

/**
 * 从角色页的「我的贡献」区块读出**当前登录账号的昵称**。
 *
 * 页面结构:
 *   我的贡献
 *     <昵称>
 *     已为Ta表白N次 · 增加M热度
 *
 * 两个用途:
 *   ① 当日志前缀 —— 每行都知道是哪个号在动
 *   ② **核对页面属于哪个账号** —— 切号之后万一页面还是上一个号的缓存,
 *      这里会对不上。否则「已签过,跳过」看起来完全正常,实际一个都没签,
 *      那种错最难发现。
 */
function 读页面账号名() {
    var 贡 = 找可见(text("我的贡献"));
    if (!贡) return null;
    var 上 = 贡.bounds();
    var 最近 = null, 最小差 = 1e9;
    try {
        var 全 = textMatches(/[\s\S]+/).find();
        for (var i = 0; i < 全.size(); i++) {
            var o = 全.get(i);
            if (!在屏幕上(o)) continue;
            var t = o.text(), b = o.bounds();
            if (t === "我的贡献") continue;
            if (t.indexOf("已为Ta表白") === 0) continue;
            if (b.top < 上.bottom - 10) continue;      // 必须在「我的贡献」下方
            var 差 = b.top - 上.bottom;
            if (差 < 最小差) { 最小差 = 差; 最近 = t; }
        }
    } catch (e) {}
    return 最近;
}

/** 页面上确实是这个角色吗 —— 防止深链跳错页,对着别人表白 */
function 确认是这个角色(名) {
    return 找可见(text(名)) !== null;   // 同上:只认屏幕上的
}

/**
 * 页面指纹 = 角色页上那行「77.0万次表白 · 4834.2万热度」。
 *
 * 【为什么需要它】
 *   光看名字不够。实测栽过:两个角色都叫「龚俊」(《地球超新鲜》1 和 2),
 *   前一个跑完停在龚俊页(已经变「已表白」),后一个深链没跳过去,
 *   名字一样 → 校验通过 → 读到「已表白」→ 报「今天已签过,跳过」。
 *   实际根本没签,而且**日志显示成功**,这种错最难发现。
 *   数字每个角色都不同,拿它当「页面到底换没换」的凭据。
 */
function 页面指纹() {
    var o = 找可见(textContains("次表白"));   // 屏幕外那一屏的数字会串页,必须只认可见的
    return o ? o.text() : null;
}

var 上一个指纹 = null;
var 本次指纹 = null;

/**
 * 签一个角色(外壳)。
 * ⚠️ 指纹只有这一轮**成功**之后才提升成「上一个」。
 *    失败也提升的话,重试时会拿自己上一轮留下的指纹当基准,
 *    把正常的重试误判成「页面没换」。
 */
function 签一个(角色) {
    本次指纹 = null;
    var 结果 = 签一个内部(角色);
    if (结果.indexOf("失败") !== 0) 上一个指纹 = 本次指纹;
    return 结果;
}

/**
 * 发深链,一直等到「真的站在这个角色的页面上」。成功返回新指纹,失败返回 null。
 *
 * 【为什么把三段等待合成一段】
 *   原先是:等腾讯到前台 → 等 Activity 是角色页 → 等内容加载 → 校验名字 → 校验指纹,
 *   每段各自超时、各自重发。问题是**没有一段能真正判断「到位了」**:
 *     · 前台是腾讯    —— 可能停在首页
 *     · Activity 对   —— 可能还是**上一个角色**的页面(我们本来就站在一个角色页上)
 *     · 名字对        —— 两个角色都叫「龚俊」时分不开
 *   只有「指纹变了 + 名字对」才是到位的正面证据。所以统一成一个循环:
 *   盯着这个证据,没等到就每 2.2 秒重发一次深链。
 *
 * 【⚠️ currentActivity() 在这儿是不可信的】
 *   中途一度以为「从角色页直接深链到下一个角色页,腾讯必定先把你甩到首页」——
 *   因为 `等Activity(角色页, 3000)` 每次都超时,读到的是 HomeActivity,
 *   重发一次才「成功」。据此还写过「back() 是让深链一次走对的前提」。
 *   **两个都是误判。** 改成盯页面内容之后,7 个角色 16 秒跑完、一次重发都没触发 ——
 *   页面其实早就换好了,是 `currentActivity()` 报了好几秒的旧值/首页。
 *   那些「重发」不但没用,还是变慢的原因本身。
 *   教训:判断「到没到位」要看**页面内容**,别看 Activity 名字。
 *
 * 这一个循环顺带兜住了:用户切走了前台、系统弹窗、来电、深链没生效、页面加载慢。
 */
function 去角色页(链, 页面名, 总超时) {
    try { 开深链(链); } catch (e) { 记("  发深链出错:" + e); return null; }
    var 截止 = Date.now() + 总超时;
    var 重发 = 0, 上次重发 = Date.now();
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        var f = 页面指纹();
        if (f && f !== 上一个指纹 && 确认是这个角色(页面名)) return f;
        if (Date.now() - 上次重发 > 2200 && 重发 < 3) {
            重发++; 上次重发 = Date.now();
            var 现在 = (currentPackage() === 腾讯包)
                ? String(currentActivity() || "?").replace("com.tencent.qqlive.ona.activity.", "")
                : ("别的App:" + currentPackage());
            记("  还没到位(" + 现在 + "),重发深链");
            try { 开深链(链); } catch (e) {}
        }
        sleep(250);
    }
    return null;
}

function 签一个内部(角色) {
    记("── " + 角色.名 + " ──");

    var 链 = "txvideo://v.qq.com/TopicFeedsPageActivity?topic_id=" + 角色.topic
           + "&page_type=feed_topic_nav&topic_type=11";
    var 页面名 = 角色.页面名 || 角色.名;

    var 指纹 = 去角色页(链, 页面名, 25000);
    if (!指纹) {
        return "失败:没到达「" + 页面名 + "」的角色页(当前 " + currentPackage()
             + " / " + currentActivity() + ")";
    }
    记("  页面指纹:" + 指纹);
    本次指纹 = 指纹;

    // 顺手确认这一页属于哪个账号(切号之后尤其重要)
    /*
     * 核对页面到底属于哪个号。注意:读不到名字时是**静默放行**的,
     * 所以每轮至少报一次读到了什么 —— 否则「没报警」到底是「核过没问题」
     * 还是「压根没核」分不出来,这个防呆就等于不存在。
     */
    var 页上账号 = 读页面账号名();
    if (!本轮报过页面账号 || !页上账号 || (当前账号名 && 页上账号 !== 当前账号名)) {
        本轮报过页面账号 = true;
        记("  页面账号:" + (页上账号 || "⚠ 读不到"));
    }
    if (页上账号) {
        if (!当前账号名) {
            当前账号名 = 页上账号;              // 单号模式:第一次进页面才知道自己是谁
        } else if (页上账号 !== 当前账号名) {
            return "失败:页面属于「" + 页上账号 + "」,不是「" + 当前账号名
                 + "」—— 可能切号没生效或页面是旧缓存";
        }
    }

    var 钮 = 找表白钮(15000);
    if (!钮) return "失败:找不到表白按钮";

    if (钮.文案 === "已表白") {
        记("  今天已表白过,跳过");
        return "已完成";
    }

    if (配置.干跑) {
        记("  【干跑】不点。按钮在 (" + 钮.框.centerX() + "," + 钮.框.centerY() + ")");
        return "待表白";
    }
    记("  点 (" + 钮.框.centerX() + "," + 钮.框.centerY() + ")");
    /*
     * ⚠️ 点之前先把悬浮条设成「不接收触摸」。
     *    click() 是往屏幕上派发手势,落点上**最上面那个窗口**收走 ——
     *    要是悬浮条正好盖在表白按钮上,我们就会点到自己的悬浮条。
     *    位置已经挪开了,但这道保险跟位置无关:哪天腾讯改版把按钮挪到别处,
     *    或者用户换了个奇怪分辨率的机器,都不会因此点空。
     */
    try { if (控制条) 控制条.setTouchable(false); } catch (e) {}
    click(钮.框.centerX(), 钮.框.centerY());
    try { if (控制条) 控制条.setTouchable(true); } catch (e) {}

    /*
     * 点完之后有两种情况(实测都遇到过):
     *   A. 直接就变「已表白」,什么都不弹。
     *   B. 弹出「一周表白挑战」面板盖住页面 → 要 BACK 关掉才看得到按钮。
     * ⚠️ 坑:不能点完就无脑 BACK。实测点完当下面板并没出现,那一下 BACK
     *    直接把整个角色页退掉了,退回首页,于是验证不到「已表白」→ 误报失败,
     *    其实表白已经成功了。所以改成轮询等结果,只有检测到挡路的面板才 BACK。
     */
    /*
     * 【怎么判断表白成功】
     *   判据是**我点的那个按钮自己变成了「已表白」**,不是「屏幕上存不存在『已表白』四个字」。
     *   ⚠️ 后者有两个毛病:
     *     · 读得到屏幕外的节点 —— 横向容器里旁边那一屏也有按钮,可能**误报成功**
     *     · 它不针对我点的那个东西,页面上别处出现这四个字也会算数
     *   所以统一走 读表白钮(),它只认屏幕内、visibleToUser 的节点。
     *
     * 【为什么要等,等多久】
     *   点完有动画,按钮不是立刻变。而且中间可能经历「按钮读不到」的空窗(动画/重绘),
     *   所以不能一读不到就判失败。这里每 400ms 读一次、最多等 15 秒,
     *   并把**每一次状态变化和它发生在点击后第几秒**记进日志 ——
     *   这样「到底要几秒」是量出来的,不是猜的。
     */
    var 点击时刻 = Date.now();
    var 过了 = function () { return ((Date.now() - 点击时刻) / 1000).toFixed(1) + "s"; };
    var 截止 = Date.now() + 15000;
    var BACK过 = false, 上次 = "我要表白";
    while (Date.now() < 截止) {
        sleep(400);
        var 现 = 读表白钮();
        var 现文 = 现 ? 现.文案 : "(读不到按钮)";
        if (现文 !== 上次) {
            记("  +" + 过了() + " 按钮 → " + 现文);
            上次 = 现文;
        }
        if (现文 === "已表白") {
            记("  ✅ 成功,点击后 " + 过了());
            return "刚表白";
        }
        if (!BACK过 && 找可见(textContains("挑战")) !== null) {
            记("  +" + 过了() + " 弹出挑战面板,BACK 关掉");
            back();
            BACK过 = true;
            sleep(1000);
        }
    }
    记("  等了 15 秒按钮还是「" + 上次 + "」");

    // 兜底:有时按钮文案要重进页面才刷新。重进一次再看。
    记("  当场没读到「已表白」,重进页面确认");
    try { 开深链(链); } catch (e) {}
    等Activity(角色页Activity, 10000);
    sleep(3000);
    var 再 = 找表白钮(8000);
    if (再 && 再.文案 === "已表白") {
        记("  ✅ 重进后确认「已表白」");
        return "刚表白";
    }
    return "失败:点了但没变成「已表白」(现在是「" + (再 ? 再.文案 : "找不到按钮") + "」)";
}

/* ══════════════ 切换账号 ══════════════
 *
 * 【面板怎么进】
 *   txvideo://v.qq.com/AccountSwitchActivity  —— 一条深链直达,
 *   不用走「个人中心 → 设置 → 滚到底 → 切换账号」那四跳。
 *   (这个路由名是从腾讯 APK 的 dex 字串表里挖出来的,见 腾讯深链路由名.txt。
 *    早先猜了半天 AccountActivity / LoginActivity 都不通,还误判成「没有直链」。)
 *
 * 【面板长什么样】
 *   每一行 = 左边账号名 + 右边标签(「当前登录」或「点击切换」)。
 *   全部 clickable=false、没有 resource-id、没有 content-desc —— 只能靠文字和坐标。
 *
 * 【为什么按「标签」找行,而不是按位置】
 *   账号行的顺序按最近使用排,**会变**。所以不能记「第几行」。
 *   做法是:先找所有「当前登录」/「点击切换」标签,再往左找同一行的名字配对。
 */
var 切号面板链 = "txvideo://v.qq.com/AccountSwitchActivity";
// 面板的 Activity 名,留作参考。**不要拿它当到位判据** —— currentActivity() 在腾讯这个
// App 里滞后好几秒,判「到没到位」一律看页面内容。
var 切号面板Activity = "VBLoginVDlgActivity";

/** 打开切号面板。成功返回 true。 */
function 开切号面板(超时毫秒) {
    var 截止 = Date.now() + (超时毫秒 || 15000);
    var 上次发 = 0;
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        // 没到位就每 3 秒重发一次 —— 跟角色页深链同一副药。
        // (实测踩过:上一轮刚把本 App 拉回前台,紧接着发深链会被吃掉。)
        if (Date.now() - 上次发 > 3000) {
            上次发 = Date.now();
            try { 开深链(切号面板链); } catch (e) { 记("  开切号面板出错:" + e); }
        }
        if (找可见(text("切换账号")) !== null && 找可见(text("当前登录")) !== null) return true;
        sleep(300);
    }
    return false;
}

/**
 * 读面板上的账号行。返回 [{名, 当前, 框}]。
 * 配对办法:每个标签往左边找垂直方向最接近的文字节点当名字。
 * 不写死 x 坐标 —— 腾讯改版挪了位置也还能用。
 * ⚠️ bounds() 是 android.graphics.Rect:`left/top/right/bottom` 是**字段**,
 *    `centerX()/centerY()/width()/height()` 才是方法。写成 `b.right()` 会报
 *    「right は関数ではなく, number です」。
 */
/*
 * 读一次面板。⚠️ 别直接用它 —— 用 稳读账号面板(),见下面那段。
 */
function 读账号面板一次() {
    var 行们 = [];
    var 标签们 = [];
    ["当前登录", "点击切换"].forEach(function (t) {
        try {
            var 全 = text(t).find();
            for (var i = 0; i < 全.size(); i++) {
                var o = 全.get(i);
                if (在屏幕上(o)) 标签们.push({ 文: t, 框: o.bounds() });
            }
        } catch (e) {}
    });
    var 全文 = null;
    try { 全文 = textMatches(/[\s\S]+/).find(); } catch (e) { return 行们; }

    标签们.forEach(function (标) {
        var 最近 = null, 最小差 = 1e9, 名框 = null;
        for (var k = 0; k < 全文.size(); k++) {
            var o = 全文.get(k);
            if (!在屏幕上(o)) continue;
            var t = o.text(), b = o.bounds();
            if (t === "当前登录" || t === "点击切换") continue;
            if (t === "切换账号" || t === "登录其他账号") continue;
            if (b.right > 标.框.left) continue;          // 名字必须在标签左边
            var 差 = Math.abs(b.centerY() - 标.框.centerY());
            if (差 > 60) continue;                            // 同一行
            if (差 < 最小差) { 最小差 = 差; 最近 = t; 名框 = b; }
        }
        if (最近) 行们.push({ 名: 最近, 当前: 标.文 === "当前登录", 框: 名框 });
    });
    // 按 y 排,让顺序跟屏幕一致,方便看日志
    行们.sort(function (a, b) { return a.框.centerY() - b.框.centerY(); });
    return 行们;
}

/*
 * 等面板内容**稳定**下来再读。
 *
 * ⚠️ 这是必需的,不是保险。开切号面板() 一看到「切换账号」+「当前登录」就返回,
 *    而那时候账号行往往还没排完 —— 读到的是半成品,表现为
 *    「✗ 面板上读不到账号行」或者「没有可切的了」,而且时好时坏。
 *    (原先 开切号面板() 还要求 currentActivity() 含 VBLoginVDlgActivity,
 *     那个判断滞后好几秒,**顺带当了延时**把这个问题盖住了;把它去掉之后才暴露出来。)
 * ⚠️ 别用 sleep 顶 —— 手机快慢不一样,定死的延时不是快了就是慢了。
 *    连续两次读到的行数一样才算稳。
 */
function 稳读账号面板(超时毫秒) {
    var 截止 = Date.now() + (超时毫秒 || 6000);
    var 上次数 = -1, 上次 = [];
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        var 这次 = 读账号面板一次();
        if (这次.length > 0 && 这次.length === 上次数) return 这次;
        上次数 = 这次.length; 上次 = 这次;
        sleep(300);
    }
    return 上次;
}

/** 面板里有没有重名 —— 有的话就不能只靠名字认身份 */
function 有重名(行们) {
    var 见过 = {};
    for (var i = 0; i < 行们.length; i++) {
        if (见过[行们[i].名]) return true;
        见过[行们[i].名] = true;
    }
    return false;
}

/**
 * 读当前登录账号的 UID。
 * ⚠️ 必须从**设置页点进去**「账号信息管理」——
 *    深链 SettingAccountManagerActivity 落到的是另一个原生页,那个页面没有账号ID。
 *    点进去的是 H5 页(H5Activity),账号ID 在那儿。
 * ⚠️ uiautomator 读不到这个 H5 页(只返回「网页由m.v.qq.com提供」),
 *    但 AutoJs6 的无障碍读得到 —— 实测 22 个文字节点全在,含账号ID。
 */
function 读当前UID(超时毫秒) {
    try { 开深链("txvideo://v.qq.com/SettingActivity"); } catch (e) { return null; }
    var o = text("账号信息管理").findOne(超时毫秒 || 12000);
    if (!o) return null;
    var b = o.bounds();
    click(b.centerX(), b.centerY());
    var 截止 = Date.now() + 15000;
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        var 数 = 找可见(textMatches(/^\d{9,12}$/));
        if (数) return 数.text();
        sleep(400);
    }
    return null;
}

/**
 * 点了某一行之后,等到它真的变成「当前登录」。
 * 判据是**重新打开面板看那一行的标签**,不是看点击有没有反应 ——
 * 点击本身是内部换 token,不发任何 URI、也没有可见的即时反馈。
 */
function 等切号完成(名字, 超时毫秒) {
    var 截止 = Date.now() + (超时毫秒 || 25000);
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        sleep(1500);
        if (!开切号面板(8000)) continue;
        var 现 = 稳读账号面板();
        for (var i = 0; i < 现.length; i++) {
            if (现[i].名 === 名字 && 现[i].当前) return true;
        }
    }
    return false;
}

/**
 * 多账号模式:把切号列表里**每个号都覆盖一遍**,每个号跑一轮签到。
 * 「一轮」= 列表里有几个号就要做几个(含一开始就登着的那个)。
 */
function 跑全部账号(每个号做的事) {
    记("=== 多账号模式 ===");
    多账号进行中 = true;
    轮摘要 = [];
    if (!开切号面板()) { 记("✗ 打不开切换账号面板"); return; }
    var 行们 = 稳读账号面板();
    if (行们.length === 0) { 记("✗ 面板上读不到账号行(解析失败?)"); return; }

    记("本轮共 " + 行们.length + " 个账号:");
    行们.forEach(function (r) { 记("  · " + r.名 + (r.当前 ? "  ← 当前登录" : "")); });

    var 用UID = 有重名(行们);
    if (用UID) 记("⚠️ 列表里有重名,改用账号ID 认身份(每次切完多读一个页面)");

    var 做过 = {}, 完成数 = 0, 保险 = 行们.length * 3;
    var 当前行 = null;
    for (var i = 0; i < 行们.length; i++) if (行们[i].当前) 当前行 = 行们[i];

    // ① 先跑一开始就登着的那个
    var 身份 = 用UID ? 读当前UID() : (当前行 ? 当前行.名 : "(未知)");
    记("");
    轮次前缀 = "1/" + 行们.length + " ";
    当前账号名 = 当前行 ? 当前行.名 : "";
    记("【1/" + 行们.length + "】当前账号 " + (当前行 ? 当前行.名 : "?")
       + (用UID ? "  ID=" + 身份 : ""));
    做过[身份] = true; 完成数++;
    每个号做的事();

    // ② 再把其余的逐个切过去
    while (完成数 < 行们.length && 保险-- > 0) {
        if (控制.中止) throw 中止信号;
        if (!开切号面板()) { 记("✗ 打不开面板,停"); break; }
        var 现 = 稳读账号面板();
        var 目标 = null;
        for (var k = 0; k < 现.length; k++) {
            if (现[k].当前) continue;
            if (!用UID && 做过[现[k].名]) continue;
            目标 = 现[k]; break;
        }
        if (!目标) {
            // 光说「没有可切的了」查不下去 —— 把这一眼看到的面板原样打出来。
            记("没有可切的了(这次面板读到 " + 现.length + " 行)");
            for (var d = 0; d < 现.length; d++)
                记("    · " + 现[d].名 + (现[d].当前 ? "  ← 当前登录" : "") +
                   (做过[现[d].名] ? "  (做过了)" : ""));
            break;
        }

        记("");
        轮次前缀 = "";
        当前账号名 = "";
        记("【" + (完成数 + 1) + "/" + 行们.length + "】切到「" + 目标.名 + "」");
        click(目标.框.centerX(), 目标.框.centerY());
        if (!等切号完成(目标.名)) { 记("  ✗ 切号没成功,停"); break; }
        记("  ✓ 已切到「" + 目标.名 + "」");

        身份 = 用UID ? 读当前UID() : 目标.名;
        if (做过[身份]) { 记("  这个号之前做过了(ID " + 身份 + "),跳过"); continue; }
        做过[身份] = true; 完成数++;
        轮次前缀 = 完成数 + "/" + 行们.length + " ";
        当前账号名 = 目标.名;
        每个号做的事();
    }

    多账号进行中 = false;
    轮次前缀 = ""; 当前账号名 = "";
    记("");
    // 一行一个号。通知用的是 BigTextStyle,界面上是多行 text,都吃换行。
    var 换行 = String.fromCharCode(10);
    var 总摘要 = "共 " + 完成数 + "/" + 行们.length + " 个账号";
    if (轮摘要.length) 总摘要 += 换行 + "· " + 轮摘要.join(换行 + "· ");
    记("=== 多账号结束:" + 完成数 + "/" + 行们.length + " 个账号 ===");
    上次结果 = 总摘要;
    try { if (偏好) 偏好.put("上次结果", 总摘要); } catch (e) {}
    回本应用();                               // 全部做完了,再把 App 切回前台
    发结果通知("多账号表白完成", 总摘要);
    toast(总摘要);
}

/** 跑一整轮:配置表里所有角色。在后台线程里跑。 */
function 跑一轮() {
    本轮报过页面账号 = false;
    记("=== 腾讯角色表白 " + 时间戳() + " ===");


    上一个指纹 = null;
    var 统计 = { 刚表白: 0, 已完成: 0, 待表白: 0, 失败: 0 };
    var 明细 = [];
    var 中止了 = false;
    var 做了几个 = 0;

    try {
        for (var i = 0; i < 配置.角色.length; i++) {
            var 角色 = 配置.角色[i];
            // 唯一的暂停点:上一个角色已经收尾、下一个还没开始,状态是干净的
            检查点(角色.名);
            进度号 = (i + 1) + "/" + 配置.角色.length;
            进度名 = 角色.名;
            刷新状态();

            var 结果 = null;
            for (var 试 = 0; 试 <= 配置.每个角色最多试; 试++) {
                结果 = 签一个(角色);
                if (结果.indexOf("失败") !== 0) break;
                记("  ✗ " + 结果);
                if (试 < 配置.每个角色最多试) 记("  → 重试");
            }
            明细.push(角色.名 + ": " + 结果);
            做了几个++;
            if (结果 === "刚表白") 统计.刚表白++;
            else if (结果 === "已完成") 统计.已完成++;
            else if (结果 === "待表白") 统计.待表白++;
            else 统计.失败++;
            sleep(1500);
        }
    } catch (e) {
        if (e !== 中止信号) throw e;       // 真异常照旧往上抛,别吞掉
        中止了 = true;
        记("");
        记("■ 用户中止,已完成 " + 做了几个 + "/" + 配置.角色.length + " 个");
    }

    记("");
    记(中止了 ? "=== 汇总(中止)===" : "=== 汇总 ===");
    明细.forEach(function (s) { 记("  " + s); });
    var 摘要 = (配置.干跑 ? "【干跑】待表白 " + 统计.待表白 + " · " : "新表白 " + 统计.刚表白 + " · ")
             + "本来就表白过 " + 统计.已完成 + " · 失败 " + 统计.失败;
    if (中止了) 摘要 += " · 未做 " + (配置.角色.length - 做了几个);
    记(摘要);

    /*
     * 跑完把自己切回前台,让用户看到结果 —— 否则界面停在腾讯视频里。
     * ⚠️ 但多账号模式下不能这么做:刚把自己拉到前台、下一句就要开腾讯的切号面板,
     *    两个动作撞在一起,面板打不开。实测就栽在这儿(3 个号只做了 2 个)。
     *    多账号由 跑全部账号 在**全部结束后**统一切回来。
     */
    if (多账号进行中) { 轮摘要.push(当前账号名 + ":" + 摘要); return; }
    上次结果 = 摘要;
    try { if (偏好) 偏好.put("上次结果", 摘要); } catch (e) {}
    回本应用();
    发结果通知(中止了 ? "表白已中止" : "表白完成", 摘要);
    toast(摘要);
}

/*
 * ⚠️ 这两句必须放在**文件最末**,不能跟上面的 刷新状态() 挤在一起:
 *    它们要用 `偏好`,而 `var 偏好 = storages.create(...)` 是在七百多行才**执行**到的。
 *    函数声明会提升,`var` 的赋值不会 —— 放前面的话 `偏好` 还是 undefined,
 *    「只问一次」记不住,会每次启动都弹一遍。踩过。
 */
美化按钮();
try { if (偏好) 上次结果 = 偏好.get("上次结果", "") || ""; } catch (e) {}
// ⚠️ 跟上次结果一样,要等 偏好 赋值完才读得到;读完立刻刷一次,
//    否则会先按默认值张开、一秒后才收起,闪一下。
try { if (偏好) 展开设置 = 偏好.get("设置展开", true); } catch (e) {}
刷新状态();
建通知渠道();
首次问通知();
