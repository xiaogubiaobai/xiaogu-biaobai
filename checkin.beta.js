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
var 构建标记 = "远程 2026.09.19.1";

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
/*
 * 这一轮要依次操作哪几个 App。
 * ⚠️ 为什么是**列表**不是单个:有人手机上不止一个能处理 txvideo:// 的客户端
 *    (国际版、改过包名的版本),每个里面登着不同的号。选两个就第一个全跑完再跑第二个。
 * ⚠️ 只选一个时,行为跟以前**完全一样**(长度为 1 的循环)。
 */
var 目标包们 = [];               // 存的是**键**(包名#user),不是纯包名
var 腾讯包 = 默认腾讯包;          // 启动时由 定腾讯包() 改写

/*
 * ── 为什么目标要带 user ──
 * 分身(应用双开)跟本尊是**同一个包名、同一个 ComponentName**,只有 UserHandle 不同。
 * 所以光靠包名根本区分不了两者 —— 列表里会出现两个一模一样的「腾讯视频」。
 * 能区分的是 uid:Android 的规则是 uid = userId * 100000 + appId,
 * 所以 uid / 100000 就是它属于哪个 user(本尊 0,三星分身 95,MIUI 双开一般 999)。
 */
var 我的user = 0;
try { 我的user = Math.floor(android.os.Process.myUid() / 100000); } catch (e) {}
var 腾讯user = 我的user;

function 拼键(包名, user) { return 包名 + "#" + user; }
function 拆键(键) {
    var t = String(键 || ""), i = t.indexOf("#");
    if (i < 0) return { 包名: t, user: 我的user };   // 旧版存的是纯包名
    var u = parseInt(t.substring(i + 1), 10);
    return { 包名: t.substring(0, i), user: isNaN(u) ? 我的user : u };
}
function 用目标(键) {
    var t = 拆键(键);
    腾讯包 = t.包名;
    腾讯user = t.user;
}

/*
 * 问系统:**所有 user 里**哪些实例能处理我们的深链。
 * 返回 [{键, 包名, user, 名字, 版本, 是本机}]
 *
 * ⚠️ 两步走,不能一步:
 *    queryIntentActivities **只看本 user**,分身永远不出现在里面。
 *    所以先用它拿到「有哪些包能处理」,再用 LauncherApps 逐个 profile 查「这个包装没装」。
 * ⚠️ 名字必须用 LauncherActivityInfo.getLabel(),**不能**用 ResolveInfo.loadLabel() ——
 *    后者给的是 **activity 标签**,实测在 AutoJs 类 App 上返回「スクリプトの編集」
 *    这种东西,不是应用名。踩过。
 * ⚠️ 三星上分身的 label 跟本尊**一模一样**(vivo 才加「Ⅱ.」前缀),
 *    首次安装时间也一样(install-existing 共用同一份 APK)——
 *    所以界面上必须标出 user 号,不能指望名字能区分。
 */
var 上次候选描述 = "";     // 见 腾讯候选() 末尾:同样的内容不重复刷日志

function 腾讯候选() {
    var 出 = [], 包们 = [], 见过 = {};
    var pm = context.getPackageManager();
    try {
        var it = new android.content.Intent(android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse("txvideo://v.qq.com/TopicFeedsPageActivity"));
        var 表 = pm.queryIntentActivities(it, 0);
        for (var i = 0; i < 表.size(); i++) {
            var p = String(表.get(i).activityInfo.packageName);
            if (!见过[p]) { 见过[p] = true; 包们.push(p); }
        }
    } catch (e) { 诊("查能处理深链的包出错:" + e); }

    function 版本号(包) {
        try { return String(pm.getPackageInfo(包, 0).versionName); } catch (e) { return "?"; }
    }
    /*
     * ⚠️ 这一行日志是**排障的命根子**。分身的 user 号各家不一样
     * (三星 DUALAPP 95、MIUI 双开 999、手机分身 11 …),代码里哪儿都没写死,
     * 靠的就是 getProfiles() 枚举出来什么算什么。
     * 但「枚举到了什么」不打出来的话,用户报「操作对象里只有一个」时根本分不出是
     *   ① 这台机器的分身**不是**独立 user(厂商用容器实现,LauncherApps 看不见)
     *   ② 还是我们哪一步把它漏了
     * —— 这两种要改的东西完全不同。
     */
    var 侧写们 = [];
    try {
        var la = context.getSystemService(android.content.Context.LAUNCHER_APPS_SERVICE);
        var ps = la.getProfiles();
        for (var u = 0; u < ps.size(); u++) {
            var uh = ps.get(u);
            try { 侧写们.push(String(uh)); } catch (e) { 侧写们.push("?"); }
            for (var k = 0; k < 包们.length; k++) {
                var 包 = 包们[k], al = null;
                try { al = la.getActivityList(包, uh); } catch (e) { continue; }
                if (!al || al.size() === 0) continue;       // 这个 user 里没装
                var lai = al.get(0), 名字 = 包, uid = -1;
                try { 名字 = String(lai.getLabel()); } catch (e) {}
                try { uid = lai.getApplicationInfo().uid; } catch (e) {}
                var uu = uid >= 0 ? Math.floor(uid / 100000) : 我的user;
                出.push({ 键: 拼键(包, uu), 包名: 包, user: uu, 名字: 名字,
                          版本: 版本号(包), 是本机: uu === 我的user });
            }
        }
    } catch (e) { 诊("跨 profile 枚举出错:" + e); }

    var 描述 = [];
    for (var d = 0; d < 出.length; d++)
        描述.push("[" + 出[d].键 + " 名=" + 出[d].名字 + " " + 出[d].版本
                  + (出[d].是本机 ? " 本机" : " 分身") + "]");
    // ⚠️ 只在**内容变了**才记。腾讯候选() 一轮里会被叫好几次(界面状态行也用它),
    //    每次都打就是一行两百多字刷四遍,真正要看的东西反而被埋了。
    var 这句 = "我在 user " + 我的user + ";系统 profile " + (侧写们.join(",") || "(枚举不到)")
             + ";能处理深链的包 " + 包们.join(",")
             + ";操作对象候选 " + 出.length + " 个:" + 描述.join(" ");
    if (这句 !== 上次候选描述) { 上次候选描述 = 这句; 诊(这句); }

    // 兜底:LauncherApps 整个用不了(老系统/定制系统)时,退回「只看本 user」
    if (!出.length) {
        诊("LauncherApps 那条路一个都没枚举到,退回「只看本 user」");
        for (var m = 0; m < 包们.length; m++) {
            var 名2 = 包们[m];
            try { 名2 = String(pm.getApplicationLabel(pm.getApplicationInfo(包们[m], 0))); } catch (e) {}
            出.push({ 键: 拼键(包们[m], 我的user), 包名: 包们[m], user: 我的user,
                      名字: 名2, 版本: 版本号(包们[m]), 是本机: true });
        }
    }
    return 出;
}

/*
 * 定下这一轮依次操作哪几个包。返回候选表。
 * ⚠️ 记住的那份要**按当前候选过滤** —— 用户可能把某个 App 卸了,
 *    照着旧记录去发深链会打到不存在的包上,而且报错很难懂。
 */
function 定目标们() {
    var 候选 = 腾讯候选();
    if (!候选.length) { 目标包们 = []; 腾讯包 = 默认腾讯包; return 候选; }
    var 记住 = [];
    try { if (偏好) 记住 = String(偏好.get("目标包们", "") || "").split(","); } catch (e) {}
    var 在 = {};
    for (var i = 0; i < 候选.length; i++) 在[候选[i].键] = true;
    目标包们 = [];
    for (var k = 0; k < 记住.length; k++) {
        var 键 = String(记住[k] || "");
        if (!键) continue;
        if (键.indexOf("#") < 0) 键 = 拼键(键, 我的user);   // 旧版存的是纯包名,迁移
        if (在[键] && 目标包们.indexOf(键) < 0) 目标包们.push(键);
    }
    if (!目标包们.length) {
        定腾讯包();                       // 没选过:沿用「单个目标」那套(含旧版记住的那个)
        目标包们 = [拼键(腾讯包, 我的user)];
    }
    用目标(目标包们[0]);
    return 候选;
}

function 记住目标们() {
    try { if (偏好) 偏好.put("目标包们", 目标包们.join(",")); } catch (e) {}
}

/** 定下这次用哪个。有记住的就用记住的(前提是它还在候选里)。 */
function 定腾讯包() {
    var 候选 = 腾讯候选();
    if (!候选.length) { 腾讯包 = 默认腾讯包; return 候选; }
    var 记住的 = "";
    try { if (偏好) 记住的 = String(偏好.get("腾讯包", "") || ""); } catch (e) {}
    // ⚠️ 这条老路只管**本机**那些 —— 它是给「没选过操作对象」的人兜底的,
    //    默认不该把人直接扔进分身。
    var 本机 = [];
    for (var i = 0; i < 候选.length; i++) if (候选[i].是本机) 本机.push(候选[i]);
    if (!本机.length) 本机 = 候选;
    for (var j = 0; j < 本机.length; j++) {
        if (本机[j].包名 === 记住的) { 腾讯包 = 记住的; 腾讯user = 本机[j].user; return 候选; }
    }
    腾讯包 = 本机[0].包名;         // 没记住过、或记的那个已经不在了
    腾讯user = 本机[0].user;
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
// 多目标时:这个目标后面还有没有别的目标要跑。同理,后面还有就别把本 App 拉回前台 ——
// 用户反馈「第一个跑完 App 就弹到前面,以为整个跑完了」。见 跑一轮 / 跑全部账号 末尾。
var 还有下一个目标 = false;
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
                  操作对象。⚠️ **只在系统里有两个以上能处理 txvideo:// 的 App 时才显示** ——
                     绝大多数人只有一个腾讯视频,给他看一行永远只有一个选项的设置是噪音。
                */}
                <vertical id="行目标区" visibility="gone">
                    <text h="1" bg="#ececec"/>
                    <horizontal id="行目标" h="64" gravity="center_vertical">
                        <vertical w="0" layout_weight="1">
                            <text text="操作对象" textSize="15sp" textColor="#1f1f1f"/>
                            <text id="态目标说明" text="" textSize="12sp" textColor="#8a8a8a"/>
                        </vertical>
                        <text id="态目标" text="" textSize="14sp" textColor="#8a8a8a"/>
                    </horizontal>
                </vertical>
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
                        bg="#fdeaf1" textColor="#c2185b"/>
                <button id="停止钮" text="停止" textSize="18sp" h="60" layout_weight="1"
                        margin="10 0 0 0" bg="#5f6368" textColor="#ffffff"/>
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
                    {/* ⚠️ 只有加载器认这个开关的包才显示(见 有自动查开关 那个记号)。
                        老包拉到新脚本也不会画出来 —— 画了就是个死开关 */}
                    <horizontal id="行自动查" h="56" gravity="center_vertical" visibility="gone">
                        <vertical layout_weight="1">
                            <text text="自动查更新" textSize="15sp" textColor="#1f1f1f"/>
                            <text id="自动查说明" text="" textSize="12sp" textColor="#8a8a8a"/>
                        </vertical>
                        <Switch id="自动查开关" checked="true"/>
                    </horizontal>
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
                {/* ⚠️ 复制的是**全部含诊断**,不是屏幕上看到的那些 ——
                    这颗键存在的理由就是「把日志发给维护者」,而诊断行恰恰是最有用的那批。
                    用户原先只能截图:长了截不全,也没法搜。 */}
                <text id="日志复制" text="复制" textSize="13sp" textColor="#1a73e8" padding="8"/>
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
// 一轮里只清一次腾讯的页面栈 —— 清不好就是别的原因,再清也没用,只会白等
var 已重置过 = false;

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

/*
 * 控制条摆哪儿。两个位置,来回挪。
 *
 * ⚠️ **45%(常位)** 是给角色页用的:角色页的「我要表白」按钮实测在 (933, 349) —— 注意
 *    x=933 正好落在控制条这一列底下,所以控制条**绝对不能长期待在顶部**,不然会把它盖死。
 *    而控制条是 setTouchable(true) 的,**盖住的地方点不进去**,不是只挡住看不见而已。
 *
 * ⚠️ **4%(让位)** 是给切号面板用的:面板是**底部弹层**,占掉屏幕下半,
 *    控制条停在 45% 正好压在账号行上(实测截图:第二行的「点击切换」整个被盖住)。
 *    这次三个号还是切成了,纯粹因为脚本点的是账号**名字**(在左边 x≈330~600),
 *    不是右边那个标签 —— **是运气不是设计**。名字长一点、面板改个版就会点到控制条上,
 *    表现成「切号没成功」,而且查不到原因(日志里一切正常,就是没切过去)。
 *
 * 所以:开面板前挪到顶,进角色循环时挪回来。
 */
/*
 * 控制条**固定在右侧 45%,不再来回挪**。
 *
 * ⚠️ 一度做成「开切号面板时挪到右上角」,因为它会压住账号行的「点击切换」。
 *    后来想清楚了:脚本点的是账号**名字**的框(`读账号面板一次()` 返回的 `框` 就是名字,
 *    在左边 x≈330~600),控制条在 x≈720 往右,**压根碰不到**。
 *    而挪到顶部反而撞上面板右上角的关闭 ✕ —— 越挪越糟,而且位置跳来跳去本身就是噪音。
 * ⚠️ 45% 这个高度是给角色页定的:「我要表白」按钮实测在 (933, 349),x 正好在控制条
 *    这一列底下,所以控制条**绝不能待在顶部**,否则会把它盖死(悬浮条可触摸,盖住就点不进去)。
 */
var 控制条常位 = 0.45;
// 悬浮条上那一行「第几个号 / 哪个号」。⚠️ 不要复用 轮次前缀/当前账号名 ——
// 那两个在切号那几秒是**空的**(切完才填),正好是最想看到进度的时候。
var 账号进度 = "", 账号名显示 = "";
// ⚠️ 尺寸写成常量:布局、setSize、挪位置三处都要用同一组数,各写各的迟早对不上
//    (悬浮窗的大小是创建那一刻按内容量的,setSize 比内容小就会裁掉一截)。
var 条宽dp = 94, 条高dp = 198, 条缩dp = 6;

function 挪控制条(高比例) {
    if (!控制条) return;
    try {
        var 密 = context.getResources().getDisplayMetrics().density;
        var 宽 = Math.round(条宽dp * 密), 缩 = Math.round(条缩dp * 密);
        控制条.setPosition(device.width - 宽 - 缩, Math.round(device.height * 高比例));
    } catch (e) { 诊("(挪控制条失败:" + e + ")"); }
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
                {/*
                  ⚠️ **建的时候先藏起来**(invisible,不是 gone —— gone 不占位会影响量尺寸)。
                     floaty 建好的窗口默认落在 **(0,0) 左上角**、也还没上妆,而摆位置和上妆
                     都必须等 attach 之后(见下面那条大坑),中间有 0.4 秒空档。
                     不藏的话用户就会看到「左上角闪出一个方角的半透明面板」——
                     而且正好撞上切进腾讯 App 那一下,看着像是哪里没改干净。
                     摆好、上妆完再 setVisibility(VISIBLE)。
                */}
                <vertical id="盒" bg="#f5202124" padding="9" gravity="center"
                          visibility="invisible">
                    {/* 上半:在第几个号、哪个号。下半:这个号做到第几个角色 */}
                    <text id="号" text="" textColor="#bdc1c6" textSize="9sp"
                          w="76" h="34" gravity="center"/>
                    <text h="1" bg="#40ffffff" margin="0 3 0 7"/>
                    <text id="字" text="准备中" textColor="#ffffff" textSize="10sp"
                          w="76" h="40" gravity="center"/>
                    {/*
                      ⚠️ 按钮必须 padding="0" 并且给够高。系统 Button 自带 minHeight 48dp
                         和上下 padding,你把 h 压到 32 的话文字被排到可见区外面,
                         **上下各卡掉一截** —— 实测就是「暂停」显示成「斩信」。
                         缩小的时候行高要跟着字号一起算,不能只改一头。
                    */}
                    <button id="暂" text="暂停" w="76" h="42" textSize="11sp" padding="0"
                            bg="#fdeaf1" textColor="#c2185b"/>
                    <button id="停" text="停止" w="76" h="42" textSize="11sp" padding="0"
                            margin="0 6 0 0" bg="#5f6368" textColor="#ffffff"/>
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
                // 内容 76 宽 + 左右各 9 padding = 94(用户觉得 104 稍宽)
                // 高 34 + (1+3+7 分隔线) + 40 + 42 + 6 + 42 + 上下 20 = 195,给到 198 留余量
                var 宽 = Math.round(条宽dp * 密), 高 = Math.round(条高dp * 密);
                控制条.setSize(宽, 高);
                // 贴右边缘、竖向放在 45% 高度处。
                // 表白按钮实测在 y≈328~370,这里从 y≈0.45*屏高 才开始,隔得很开。
                挪控制条(控制条常位);
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
                玻璃.setCornerRadius(14 * 屏幕密度);
                控制条.盒.setBackground(玻璃);
                // 胶囊(圆角 = 高度一半)。深卡上用浅色按钮更清楚,停止保留红色语义。
                var 初 = 暂停配色();
                装按钮(控制条.暂, 初.底, 初.字, 初.纹, 16);
                条暂色 = 初.底;
                装按钮(控制条.停, 中性深, "#ffffff", 白纹, 16);
                控制条.盒.setVisibility(android.view.View.VISIBLE);   // 摆好上妆完,现在才露脸
            } catch (e) { 诊("(悬浮条上妆失败:" + e + ")"); }
            try {
                控制条.暂.on("click", function () {
                    控制.暂停 = !控制.暂停;
                    诊("[悬浮条] 暂停键被按 → " + (控制.暂停 ? "暂停" : "继续"));
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
/*
 * 跑动时那两个动作的颜色。**界面上的大按钮和悬浮条上的小按钮必须是同一套** ——
 * 同一个动作在两个地方长得不一样,用户会以为是两回事(原先界面是橙/深红,
 * 悬浮条是白/亮红,是两套)。颜色按**状态**走,不按位置走。
 *
 * ⚠️ 全部收进 App 的粉色基调。一度做成橙/绿/红那种「红绿灯」配色,跟粉色主调打架 ——
 *    用户原话:「上一版粉色基调的比较好。」
 * ⚠️ 「停止」用**中性深灰**,不用红:它其实不危险(只是结束这一轮,不删东西),
 *    用红色喊没道理;而且红挨着粉很闷。灰色跟「版本信息/运行日志」那两个入口同色,
 *    整页只剩粉 + 灰两个调子。
 */
function 暂停配色() {
    return 控制.暂停 ? { 底: "#e8437c", 字: "#ffffff", 纹: 白纹 }   // 继续:粉实心
                     : { 底: 粉浅,      字: 粉深,      纹: 粉纹 };  // 暂停:淡粉底深粉字
}

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
    装按钮(ui.停止钮,     中性深,   "#ffffff", 白纹);
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

// 只在真的换色时重画,别每秒新建一个 drawable。界面和悬浮条各记各的,
// 共用一个变量的话谁先跑谁把标记清掉,另一个就永远不更新了。
var 暂停钮色 = "", 条暂色 = "", 状态底色 = "";

function 刷新状态() {
    var 开了 = 无障碍开着();
    var 跑着 = 控制.跑着;
    // 跑起来之后那两块引导没有意义了,收掉

    var 显 = android.view.View.VISIBLE, 隐 = android.view.View.GONE;
    var 悬浮 = 悬浮窗开着(), 通知 = 通知开着();
    if (跑着 && 控制条) {
        var 条文 = (控制.暂停 ? "已暂停" : 进度号) + String.fromCharCode(10) + 进度名;
        var 号文 = (账号进度 ? "号 " + 账号进度 : "单号") + String.fromCharCode(10)
                 + (账号名显示 || 当前账号名 || "…");
        ui.run(function () {
            try {
                控制条.字.setText(条文);
                控制条.号.setText(号文);
                控制条.暂.setText(控制.暂停 ? "继续" : "暂停");
                var 条配 = 暂停配色();
                if (条配.底 !== 条暂色) {
                    条暂色 = 条配.底;
                    装按钮(控制条.暂, 条配.底, 条配.字, 条配.纹, 16);
                }
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
        // 操作对象那一行:候选不足两个就整行藏起来
        try {
            var 候 = 腾讯候选();
            ui.行目标区.setVisibility(候.length >= 2 ? 显 : 隐);
            if (候.length >= 2) {
                var 名 = [];
                for (var mi = 0; mi < 候.length; mi++)
                    if (目标包们.indexOf(候[mi].键) >= 0)
                        // ⚠️ 三星上分身的名字跟本尊一模一样,不标一下根本分不出来
                        名.push(候[mi].名字 + (候[mi].是本机 ? "" : "(分身)"));
                ui.态目标.setText((名.length || 1) + " 个  ›");
                ui.态目标说明.setText(名.length ? 名.join("、") : "还没选");
            }
        } catch (e) {}
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
            /*
             * ⚠️ 界面上这条状态要跟悬浮条**说同一件事**:在第几个号、哪个号、第几个角色。
             *    原先只有角色进度,回到 App 反而比悬浮条知道得少。
             * ⚠️ 底色跟着 App 走粉,不要留蓝 —— 这是整个界面里最后一块蓝的地方。
             *    暂停时保留琥珀色:那是「停住了」的语义,不是装饰。
             */
            var 头 = (控制.暂停 ? "已暂停" : "表白中")
                   + (账号进度 ? "  ·  号 " + 账号进度 + " " + (账号名显示 || "") : "");
            var 尾 = 进度号 + (进度名 ? "  ·  " + 进度名 : "");
            ui.状态.setText(头 + String.fromCharCode(10) + 尾);
            ui.状态.setTextColor(colors.parseColor(控制.暂停 ? "#8a5300" : 粉深));
            var 底 = 控制.暂停 ? "#fff4e5" : 粉浅;
            if (底 !== 状态底色) {
                状态底色 = 底;
                var 面 = 圆角面(底); 面.setCornerRadius(12 * 屏幕密度);
                ui.状态.setBackground(面);       // ⚠️ 不能用 setBackgroundColor,那会把圆角冲掉
            }
            ui.暂停钮.setText(控制.暂停 ? "继续" : "暂停");
            var 配 = 暂停配色();
            if (配.底 !== 暂停钮色) {
                暂停钮色 = 配.底;
                装按钮(ui.暂停钮, 配.底, 配.字, 配.纹);
            }
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
/*
 * 自动查更新开不开。
 * ⚠️ 存在**通道自己**那份偏好里(loader-<通道>),跟 loader 读的是同一个键 ——
 *    在测试包里关掉,不该影响正式包。
 */
function 读自动查() {
    // 用户明确选过就听他的;没选过要看**加载器这次实际用的值**(默认值烤在 loader 里,
    // 界面猜不到 —— 猜的话就会出现「日志说已关、界面显示开着」)
    var 选过 = 读加载器偏好("自动查", "");
    if (选过 === "1" || 选过 === "0") return 选过 === "1";
    return 读加载器偏好("实际自动查", "1") !== "0";
}
function 写自动查(开) {
    try {
        var 基 = context.getSharedPreferences("loader", 0);
        var 通 = String(基.getString("当前通道", "") || "");
        var 盘 = 通 ? context.getSharedPreferences("loader-" + 通, 0) : 基;
        盘.edit().putString("自动查", 开 ? "1" : "0").apply();
    } catch (e) { 诊("写自动查出错:" + e); }
}
/** 这个包的加载器认不认这个开关。不认就别画 —— 画了也是死的 */
function 有自动查开关() {
    try {
        return String(context.getSharedPreferences("loader", 0)
                      .getString("有自动查开关", "")) === "1";
    } catch (e) { return false; }
}

/** 现在跑在哪条通道上。空 = 稳定。由 loader.js 启动时写进基础偏好 */
function 当前通道() {
    try {
        return String(context.getSharedPreferences("loader", 0).getString("当前通道", "") || "");
    } catch (e) { return ""; }
}

function 读加载器偏好(键, 默认值) {
    try {
        /*
         * ⚠️ 非稳定通道的加载器偏好存在 **loader-<通道>** 里(见 loader.js 的「通道」那段),
         *    读错文件的话 beta 包的「上次检查/结果/新包提示」全是空的,看着像更新链路坏了。
         *    通道名本身永远在基础那份里。
         */
        var 基 = context.getSharedPreferences("loader", 0);
        var 通 = String(基.getString("当前通道", "") || "");
        var 盘 = 通 ? context.getSharedPreferences("loader-" + 通, 0) : 基;
        return String(盘.getString(键, 默认值));
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
        /*
         * ⚠️ 这一段**只报告,不提供修改入口**。改在主界面「设置 → 操作对象」那一行,
         *    一个功能一个入口。版本信息页的职责是「报障时截一张图能说清现状」——
         *    曾经这里有个「换一个腾讯视频」,是设置里那一行还不存在时留下的,
         *    删了。别再加回来。
         * ⚠️ 要列**选中的那几个**,不是「包名等于 腾讯包 的那一个」。
         *    原先那样写在分身机型上会把本尊和分身混作一谈(同包名),
         *    而且多选了两个也只显示一个,看着像没选上。
         */
        var 几行 = [];
        for (var qi = 0; qi < 候选.length; qi++) {
            if (目标包们.indexOf(候选[qi].键) < 0) continue;
            几行.push(候选[qi].名字 + " " + 候选[qi].版本
                      + (候选[qi].是本机 ? "" : "(分身 user " + 候选[qi].user + ")"));
        }
        if (几行.length) {
            腾讯行 = 几行.join(行分 + "          ");
            if (几行.length > 1) 腾讯行 += 行分 + "          (按这个顺序依次跑完)";
        }
        if (候选.length > 1)
            腾讯行 += 行分 + "          (系统里有 " + 候选.length + " 个候选,"
                    + "在「设置 → 操作对象」里改)";
    }

    // 三个包(正式 / (测) / (beta))可能同时装在一台机器上,版本信息页必须自报家门
    var 通道行 = 当前通道() ? ("通道      " + 当前通道() + "(拉 manifest." + 当前通道()
                            + ".json,跟正式版各走各的)" + 行分) : "";
    var 文 = "应用      小菇爱表白" + 行分
           + 通道行
           + "包名      " + context.getPackageName() + 行分
           + "安装包    " + 包版本 + "(versionCode " + 包版本号 + ")" + 新包提示 + 行分 + 行分
           + "脚本      " + 构建标记 + 行分
           + "来源      " + 来源 + 行分 + 行分
           + "上次检查  " + 何时 + 行分
           + "结果      " + 读加载器偏好("上次查结果", "(还没查过)") + 行分 + 行分
           + "操作对象  " + 腾讯行;
    var 有开关 = 有自动查开关(), 自动 = 读自动查();
    ui.run(function () {
        ui.行自动查.setVisibility(有开关 ? android.view.View.VISIBLE : android.view.View.GONE);
        if (有开关) {
            ui.自动查开关.setChecked(自动);
            ui.自动查说明.setText(自动 ? "每 6 小时自己查一次"
                                     : "只有点上面那颗按钮才查(装了新安装包时仍会查一次)");
        }
        ui.装新包钮.setVisibility(新包提示 ? android.view.View.VISIBLE : android.view.View.GONE);
        ui.版本正文.setText(文);
        // ⚠️ 这句得跟着开关走。写死「每 6 小时自动查一次」的话,关了开关的人看到的是假话
        ui.查更新说明.setText((有开关 && !自动
                              ? "自动查已关;点上面的按钮可以随时查。"
                              : "每 6 小时自动查一次;点上面的按钮可以立刻查,不受这个限制。")
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

/*
 * 选操作对象。**主界面那一行和版本信息页那个入口共用这一个** ——
 * ⚠️ 别再写第二个选择框。版本页原先自己有一个「换一个腾讯视频」,是多目标之前的遗物:
 *    它只改 腾讯包、不认 user、也不写 目标包们,于是
 *      · 分身机型上列出来是两条**一模一样**的条目,根本没法选
 *      · 选完通常也不生效 —— 开跑时 定目标们() 会按记住的 目标包们 把 腾讯包 覆盖掉
 *    两个入口两套真相,这种东西迟早出事。
 */
function 选操作对象() {
    var 候选 = 腾讯候选();
    if (候选.length < 2) { toast("系统里只有一个,没得选"); return; }
    var 项 = [], 已选 = [];
    for (var i = 0; i < 候选.length; i++) {
        /*
         * ⚠️ 第二行必须带 user 标注。分身跟本尊同包名同显示名(三星上一字不差),
         *    只列名字+包名的话用户看到的是两个完全相同的条目,没法选。
         */
        var 归属 = 候选[i].是本机 ? "本机" : ("分身(user " + 候选[i].user + ")");
        项.push(候选[i].名字 + "  " + 候选[i].版本 + String.fromCharCode(10)
                + 候选[i].包名 + " · " + 归属);
        if (目标包们.indexOf(候选[i].键) >= 0) 已选.push(i);
    }
    /*
     * ⚠️ 用**回调**形式,不要用 `.then()`。这个版本的 dialogs.multiChoice 传了回调就返回 null,
     *    没传才给 Promise —— 写成 `.then(...)` 会直接抛 TypeError,而且点击回调里的异常
     *    **一声不吭**:对话框正常关掉,选择却没生效,看起来像「点了没反应」。踩过。
     */
    var 收下 = function (选中) {
        try {
            if (!选中 || !选中.length) { toast("至少要选一个"); return; }
            目标包们 = [];
            for (var j = 0; j < 选中.length; j++) 目标包们.push(候选[选中[j]].键);
            用目标(目标包们[0]);
            记住目标们();
            诊("操作对象改成:" + 目标包们.join("、"));
            刷新状态();
            if (当前页 === "版本") 画版本页();   // 从版本信息页进来的,那一页也要跟着变
            toast(目标包们.length > 1 ? "会依次跑这 " + 目标包们.length + " 个" : "只跑一个");
        } catch (e) { 诊("选操作对象出错:" + e); toast("没选成:" + e); }
    };
    try {
        var 回 = dialogs.multiChoice("要操作哪几个?(会按顺序一个一个跑完)", 项, 已选, 收下);
        if (回 && typeof 回.then === "function") 回.then(收下);   // 万一这个版本反过来
    } catch (e) { 诊("打开操作对象选择框出错:" + e); toast("打不开选择框:" + e); }
}

ui.行目标.on("click", 选操作对象);

ui.自动查开关.on("check", function (view, 勾上) {
    if (勾上 === 读自动查()) return;            // 是我们自己 setChecked 触发的,别当成用户操作
    写自动查(勾上);
    诊("自动查更新改成:" + (勾上 ? "开" : "关"));
    画版本页();
    // ⚠️ loader 是在**启动时**读这个值的,所以这次运行内不会变;说清楚免得用户以为没生效
    toast(勾上 ? "下次启动开始自动查" : "已关,想更新就点「检查更新」");
});

ui.看日志.on("click", function () { 去看日志(); });

ui.日志返回.on("click", function () { 当前页 = ""; 刷新状态(); });
ui.日志诊断.on("click", function () { 看诊断 = !看诊断; 画日志页(); });
/*
 * 复制运行日志。
 *
 * ⚠️ 复制**全部、含诊断行**,跟屏幕上显示的无关:
 *    这颗键就是给「发给维护者」用的,而诊断行(候选清单、启动法、任务号、分身框结构)
 *    恰恰是排障时最值钱的那批,屏幕上默认还是藏着的。
 * ⚠️ 剪贴板放不下太长的东西(各家上限不一样,通常几百 KB)。太长就**只留最后一段**,
 *    并在开头说明截掉了多少 —— 日志是越靠后越有用。
 */
ui.日志复制.on("click", function () {
    var 全 = 行;
    if (!全.length) {
        try { 全 = (files.exists(日志档) ? files.read(日志档) : "").split(换行符); } catch (e) { 全 = []; }
    }
    if (!全.length) { toast("还没有日志"); return; }

    var 上限 = 120000;                       // 字符数,留足余量
    var 文 = 全.join(换行符);
    var 说明 = "";
    if (文.length > 上限) {
        var 截 = 文.length - 上限;
        文 = 文.substring(截);
        // 从第一个换行处切齐,别让开头是半行
        var 断 = 文.indexOf(换行符);
        if (断 > 0) 文 = 文.substring(断 + 1);
        说明 = "(太长,前面 " + 截 + " 个字省略了)" + 换行符;
    }
    /*
     * 抬头带上包名和构建标记:一份日志发过来,先得知道它出自哪个包、哪一版 ——
     * 正式 / (beta) / (测) 三个包长得一样,光看内容分不出。
     */
    var 抬头 = "小菇爱表白 运行日志" + 换行符
             + context.getPackageName() + " · " + 构建标记
             + (当前通道() ? " · 通道 " + 当前通道() : "") + 换行符
             + new Date().toLocaleString() + 换行符 + 换行符;
    try {
        setClip(抬头 + 说明 + 文);
        toast("已复制 " + 全.length + " 行(含诊断),粘贴发给维护者就行");
    } catch (e) {
        诊("复制日志出错:" + e);
        toast("复制不了:" + e);
    }
});

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
    诊("[界面] 暂停键被按 → " + (控制.暂停 ? "暂停" : "继续"));
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
    账号进度 = ""; 账号名显示 = "";
    抓过的框 = {}; 点过分身框 = 0; 说过认不出 = {}; 说过始终提示 = false;
    遇框次数 = 0; 点掉了次数 = 0; 没点掉次数 = 0;
    报过深链形状 = false;
    上次候选描述 = "";                    // 每一轮的日志里都要有那行 profile/候选清单
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
            var 候选 = 定目标们();
            if (!候选.length) {
                记("✗ 找不到能处理 txvideo:// 的应用 —— 腾讯视频没装?");
                toast("没装腾讯视频");
                return;
            }
            /*
             * ⚠️ 选了几个就依次跑几个:**第一个全部跑完(含它自己的切号)再跑第二个**。
             *    只选一个时这就是个长度为 1 的循环,行为跟以前一模一样。
             */
            var 多目标 = 目标包们.length > 1;
            var 各家结果 = [];
            var 上个目标user = -1;      // 用来判断这一轮是不是换了 user
            for (var ti = 0; ti < 目标包们.length; ti++) {
                if (控制.中止) throw 中止信号;
                用目标(目标包们[ti]);   // ⚠️ 目标包们 存的是**键**(包名#user),不能直接赋给 腾讯包
                深链组件 = {};        // ⚠️ 换了包,深链组件必须重新解析,不然还打到上一个
                报过启动法 = false;   // 每个目标各报一次启动法(本机和分身走的不是同一条)
                本轮腾讯任务号 = -1;  // ⚠️ 换实例了,上一个的任务号必须作废
                已重置过 = false;
                /*
                 * ⚠️ 换目标 = 换了一个**完全不同的登录态**,期望的账号名必须清掉。
                 *    不清的话,去角色页() 那道「页面属于哪个号」的核对会拿上一个目标的
                 *    账号名去比,每一页都判成「✗ 失败:页面属于「我是入赘」,不是「腾讯网友」」。
                 *    踩过:本尊 + 分身 一起跑,第二个目标 7 个角色报了 2 个失败、
                 *    而且日志前缀一直挂着上一个号的名字。
                 */
                当前账号名 = ""; 轮次前缀 = "";
                账号进度 = ""; 账号名显示 = "";
                var 这个 = null;
                for (var ci = 0; ci < 候选.length; ci++)
                    if (候选[ci].键 === 目标包们[ti]) 这个 = 候选[ci];
                var 名字 = (这个 ? 这个.名字 : 腾讯包)
                         + (腾讯user !== 我的user ? "(分身 user " + 腾讯user + ")" : "");
                /*
                 * 上一个做完了 → **回桌面** → 再拉下一个。
                 *
                 * ⚠️ 换 user 时这一步是**必需的**,不是排场:上一个实例还在前台,
                 *    而它跟新目标包名相同,不让开的话 等到前台(腾讯包) 会立刻返回 true
                 *    (等于没等),深链就可能打在还没起来的实例上。踩过:本尊+分身连跑,
                 *    第二个目标好几页读不到内容。
                 * 同 user 内换包名系统本来会自己换,但也一样走桌面 —— 让「换目标」
                 * 在屏幕上始终是同一个动作,用户看得懂。
                 */
                if (ti > 0) {
                    var 旧任务 = 前台腾讯任务号();
                    诊("换目标(user " + 上个目标user + " → " + 腾讯user + "),先回桌面"
                       + (旧任务 >= 0 ? ";旧任务号 " + 旧任务 : ""));
                    // 控制条只有 76dp 宽,写不下全名 —— 给个够用的短标
                    先让开((腾讯user === 我的user ? "本机" : "分身")
                           + " " + (ti + 1) + "/" + 目标包们.length);
                }
                上个目标user = 腾讯user;
                if (多目标) {
                    记("");
                    记("══ 目标 " + (ti + 1) + "/" + 目标包们.length + ":" + 名字 + " ══");
                }
                诊("操作对象:" + 名字 + (这个 ? " " + 这个.版本 : "") + "(" + 腾讯包 + ")"
                   + (候选.length > 1 ? ",系统里共 " + 候选.length + " 个候选" : ""));

                /*
                 * ⚠️ 发任何深链之前,先把它叫到自己的首页 —— 理由见 唤醒腾讯() 那段注释:
                 *    不这么做的话,深链页会变成它任务栈的根,用户以后点图标打开的就是那一页
                 *    (实测白屏,像 App 坏了)。每个目标开头各做一次。
                 */
                if (!唤醒腾讯()) 记("  (" + 名字 + " 没能切到前台,继续试)");

                上次结果 = "";
                还有下一个目标 = (ti < 目标包们.length - 1);
                任务();
                if (多目标 && 上次结果) 各家结果.push(名字 + ":" + 上次结果);
            }
            if (多目标 && 各家结果.length) {
                // 每个目标自己发过一条通知了,这里把总账写回界面,免得只剩最后一个的
                上次结果 = 各家结果.join(String.fromCharCode(10));
                try { if (偏好) 偏好.put("上次结果", 上次结果); } catch (e) {}
            }
        }
        catch (e) {
            if (e === 中止信号) 记("■ 用户中止");
            else 记("✗ 出错:" + e);
        }
        finally {
            // ⚠️ 兜底复位。跑全部账号() 自己也有 finally,但万一是真异常从别处抛出来的,
            //    这里是最后一道 —— 留着 多账号进行中=true 会让**下一次运行**也没有结果。
            多账号进行中 = false;
            还有下一个目标 = false;   // ⚠️ 跟 多账号进行中 同理:留着会让**下一次**运行不切回前台
            控制.跑着 = false; 进度号 = ""; 进度名 = "";
            账号进度 = ""; 账号名显示 = "";
            关控制条(); 刷新状态();
        }
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
    // ⚠️ 通道要跟在构建标记**后面**:deploy.sh 靠 "构建 <来源> <标记>" 这三段核对
    //    手机上跑的是不是这次打的包,插在中间会把它顶掉。
    诊("构建 " + 构建标记 + (当前通道() ? " · 通道 " + 当前通道() : ""));
    /*
     * ⚠️ **机型必须进日志。** 厂商的拦路框、后台启动管控、分身实现方式,全是按牌子分的;
     *    没有这一行,一份日志发过来我只能从框的包名反推「这大概是 vivo」——
     *    换个牌子就完全抓瞎(2026-09-17 之前就是这样)。
     */
    var 机型 = "?";
    try {
        机型 = android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL
             + "(" + android.os.Build.BRAND + " / " + android.os.Build.DEVICE + ")";
    } catch (e) {}
    诊("机型:" + 机型);
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
/*
 * 跑完把腾讯留在**它自己的首页**,再切回本应用。
 *
 * ⚠️⚠️ 为什么要多这一步:实测角色页(`TopicFeedsPageActivity`)**被切走再恢复会白屏** ——
 *    这是腾讯自己的毛病,按一下返回键就正常。可是如果我们跑完就把它丢在角色页上,
 *    用户下次点桌面图标恢复的正是那一页,看到的就是白屏,会以为「腾讯视频打不开了」。
 *    实测过:同一台机器,停在角色页 → 点图标白屏,按一下返回 → 首页立刻正常。
 *    所以我们替他按这一下。用 CLEAR_TOP 把首页上面那些页面收掉,等价于连按返回。
 * ⚠️ 跟 唤醒腾讯() 是一对:一个保证**任务的根**是首页,一个保证**离开时停在**首页。
 *    少任何一个,用户都会在某个时机撞上白屏。
 */
function 送腾讯回首页() {
    try {
        var it = context.getPackageManager().getLaunchIntentForPackage(腾讯包);
        if (!it) return;
        it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                  | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
        发Intent(it);            // ← 目标在别的 user(分身)时走 startActivityAsUser
        /*
         * ⚠️ 这 1.2 秒不能干睡:**「拉起 App」这一步厂商一样会弹分身框**
         *    (2026-09-17 用户视频:拉起腾讯就问要本机还是分身)。
         *    干睡的话框会一直挂在那儿,下一步全在它后面排队。
         *    所以边等边过框 —— 没框的机器上这就是个等价的 sleep。
         */
        var 到 = Date.now() + 1200;
        while (Date.now() < 到) { 过分身框(); sleep(200); }
    } catch (e) { 诊("送腾讯回首页出错:" + e); }
}

function 回本应用() {
    送腾讯回首页();          // ⚠️ 必须在切回自己之前,不然腾讯就停在角色页上了
    try { context.startActivity(本应用界面Intent()); } catch (e) {}
}

/*
 * 一个目标跑完之后的前台收尾。
 *
 * ⚠️ 后面**还有目标**时不能把本 App 拉回前台 —— 用户原话:
 *    「先把我们自己拉到前台好像有点不明确,以为是做完了」。
 *    满屏都是我们的主界面 + 一条「本来就表白过 N」的结果,谁看都像整个跑完了,
 *    其实只是第一个目标而已。
 *    中间只做 送腾讯回首页()(这一步该做还得做,理由见那个函数),
 *    前台留给 先让开() 的桌面 —— 桌面上什么都没发生,配上还亮着的悬浮控制条,
 *    「还在跑、在换下一个」一眼就明白。
 */
function 收尾前台() {
    if (还有下一个目标) { 送腾讯回首页(); return; }
    回本应用();
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

/*
 * 深链:直接跳到某个页面,不用一层层点进去。
 *
 * ⚠️⚠️ **必须 setComponent,光 setPackage 不够。**
 *    用户实拍:每跳一次角色页就弹一次「选择要使用的应用」,里面两个一模一样的腾讯视频图标。
 *    原因是**三星/小米那类「双开」克隆的包名跟本尊一样**(都是 com.tencent.qqlive),
 *    只是住在另一个 Android 用户里 —— `setPackage` 只钉包名,两边都匹配,
 *    系统就弹跨用户选择器(跟工作资料那个「个人/工作」选择器是同一套东西)。
 *    钉到**具体 Activity 类名**才唯一:显式组件只会在**调用方自己的用户**里启动,
 *    跨用户要 INTERACT_ACROSS_USERS(系统权限),所以选择器没有理由出现。
 *    顺带也挡住了「真的装了两个不同包名的腾讯」那种选择框。
 * ⚠️ 组件名要**问系统要**(resolveActivity),不能写死 —— 腾讯改版换过 Activity 名。
 *    解析失败就退回只 setPackage,至少还能跑(可能弹框,但不会不动)。
 */
var 深链组件 = {};      // 包名 → ComponentName,一个包只解析一次

function 取深链组件(url) {
    if (深链组件[腾讯包]) return 深链组件[腾讯包];
    try {
        var 探 = new android.content.Intent(android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse(url));
        探.setPackage(腾讯包);
        var pm = context.getPackageManager();
        /*
         * ⚠️⚠️ 别只用 resolveActivity。候选不止一个时它返回的是**系统选择器本身**
         *    (com.android.internal.app.ResolverActivity,包名 "android")。
         *    不校验就会把选择器钉死当目标 —— **每次换角色页都强制弹框**,
         *    比不钉组件还糟。分身机型报的「新版也照样弹」最可能就是这个。
         * ⚠️ 所以改成先 queryIntentActivities 列出**全部候选**,再自己从里面挑出
         *    包名是腾讯的那一个。这样即使系统想给我们选择器,我们也能拿到真组件。
         *    拿到真组件 → 显式 Intent → 不经过解析 → 没有选择器。
         * ⚠️ 比较包名必须 String() 两边再比:activityInfo.packageName 是 Java String,
         *    跟 JS 字符串用 === 永远不相等(踩过)。
         */
        /*
         * ⚠️⚠️ **光比包名区分不了分身** —— 分身跟本尊是同一个包名、同一个
         *    ComponentName,只有 UserHandle 不同。所以候选里可能有两个「腾讯」,
         *    而 packageName 一模一样。
         * ⚠️ 能区分的是 **uid**:Android 的规则是 uid = userId * 100000 + appId,
         *    所以 uid / 100000 就是它属于哪个 user。本尊在 user 0,
         *    分身看机型(三星 DUAL_APP 是 95,MIUI 双开一般 999,手机分身是 11)。
         * ⚠️ dataDir(/data/user/<N>/包名)和 loadLabel(vivo 给分身加「Ⅱ.」前缀)
         *    是另外两个旁证,一起打进日志 —— 用户报障时这一行就能说清现场。
         * ⚠️ 选的时候优先**跟我们自己同一个 user** 的那个:ComponentName 里没有
         *    user 维度,显式 Intent 本来就只会在 caller 自己的 user 里起,
         *    所以钉本尊那个才是自洽的。
         */
        var 我的user = -1;
        try { 我的user = Math.floor(android.os.Process.myUid() / 100000); } catch (e) {}
        var 中 = null, 备 = null, 候选描述 = [];
        try {
            var 表 = pm.queryIntentActivities(探, 0);
            for (var i = 0; i < 表.size(); i++) {
                var 项 = 表.get(i);
                var ai = 项.activityInfo;
                if (!ai) continue;
                var uid = -1, dd = "?", 标签 = "?", tu = "";
                try { uid = ai.applicationInfo.uid; } catch (e) {}
                try { dd = String(ai.applicationInfo.dataDir || "?"); } catch (e) {}
                try { 标签 = String(项.loadLabel(pm)); } catch (e) {}
                // targetUserId 是隐藏字段,跨 profile 候选才有值;取不到就算了
                try {
                    var f = 项.getClass().getField("targetUserId");
                    tu = " targetUserId=" + f.getInt(项);
                } catch (e) {}
                var uu = uid >= 0 ? Math.floor(uid / 100000) : -1;
                候选描述.push("[" + ai.packageName + "/" + ai.name
                              + " uid=" + uid + " user=" + uu
                              + " 名=" + 标签 + " 数据=" + dd + tu + "]");
                if (String(ai.packageName) !== String(腾讯包)) continue;
                if (uu === 我的user) { if (!中) 中 = ai; }
                else if (!备) 备 = ai;      // 同包但别的 user —— 多半就是分身
            }
            诊("我在 user " + 我的user + ";深链候选 " + 表.size() + " 个:"
               + 候选描述.join(" ").substring(0, 420));
        } catch (e) { 诊("列候选出错:" + e); }
        if (!中 && 备) {
            诊("⚠️ 候选里腾讯只出现在别的 user(分身?),没有跟我同 user 的那个");
            中 = 备;
        }

        // 兜底:老系统上 queryIntentActivities 万一空了,再试 resolveActivity
        if (!中) {
            var ri = pm.resolveActivity(探, 0);
            if (ri && ri.activityInfo && String(ri.activityInfo.packageName) === String(腾讯包)) {
                中 = ri.activityInfo;
            } else if (ri && ri.activityInfo) {
                诊("深链组件:resolveActivity 给的是 " + ri.activityInfo.packageName
                   + "/" + ri.activityInfo.name + "(多半是选择器),不钉它");
            }
        }

        if (中) {
            var cn = new android.content.ComponentName(中.packageName, 中.name);
            深链组件[腾讯包] = cn;
            诊("深链组件:" + cn.flattenToShortString());
            return cn;
        }
        诊("深链组件:候选里没有腾讯自己的组件,退回只钉包名");
    } catch (e) { 诊("解析深链组件出错:" + e); }
    return null;
}

/*
 * 把 Intent 发到**当前目标所在的那个 user**。
 *
 * ⚠️⚠️ 普通 startActivity **永远在 caller 自己的 user 里起** —— ComponentName 里
 *    只有 (包名, 类名) 两个字符串,没有 user 维度,前台摆着谁也不影响解析。
 *    (实测过三次:冷启动 / 分身在前台 / 两边都预热,统统落回本机。)
 *    唯一能带着参数跨过去的是 Context.startActivityAsUser(Intent, UserHandle)。
 * ⚠️ 它是 @hide,只能反射调。为什么不用签名权限也能跨:分身是 parentId=0 的
 *    **同组 profile**,AOSP 的 handleIncomingUser 对同组走 ALLOW_NON_FULL_IN_PROFILE
 *    分支,不需要 INTERACT_ACROSS_USERS_FULL。实测(三星 DUALAPP user 95)可用,
 *    logcat 里连 hidden API 警告都没有。
 * ⚠️ 本项目 targetSdk=29,非 SDK 接口限制才这么宽松。**以后要是提 targetSdk,
 *    这条可能被拦** —— 所以拿不到方法就退回普通启动(对本机目标零影响)。
 */
/*
 * 前台那个腾讯窗口的**任务号**。
 *
 * ⚠️ 为什么需要它:currentPackage() 只给包名,而分身和本尊**包名一样** ——
 *    从本尊切到分身时,本尊还在前台,「等到前台(腾讯包)」会立刻返回 true,
 *    等于没等,后面的深链就可能打在还没起来的实例上(角色页变成任务根 → 白屏)。
 *    任务是**按 user 分的**,所以任务号一变就说明换实例了。
 * ⚠️ AccessibilityWindowInfo.getTaskId() 是 Android 14(API 34)才转正的,
 *    老机器上没有 —— 拿不到就返回 -1,调用方必须能接受「不知道」。
 */
/*
 * ⚠️ 默认**只看一眼**。刚切到前台那一瞬窗口列表可能还没登记完,多试几次才读得到,
 *    但它是**纯诊断**的,却夹在「腾讯到前台」和「发深链」中间 ——
 *    而唯一读不到窗口的场合恰恰是开屏广告,那正是最不该再拖 1.6 秒的时候。
 *    读不到就返回 -1(调用方本来就容忍,-1 连日志都不打)。真要等就自己传回数。
 */
function 前台腾讯任务号(回数) {
    for (var 回 = 0; 回 < (回数 || 1); 回++) {
        try {
            var ws = auto.service.getWindows();
            for (var i = 0; i < ws.size(); i++) {
                var w = ws.get(i), r = null;
                try { r = w.getRoot(); } catch (e) { continue; }
                if (!r) continue;
                if (String(r.getPackageName()) !== String(腾讯包)) continue;
                /*
                 * ⚠️ 必须**反射**调,直接 w.getTaskId() 在 Rhino 里拿不到值
                 *    (探针里反射能读出 28422,直接调就是 -1)。
                 *    Android 13 及以下根本没这个方法,catch 掉当「不知道」。
                 */
                try {
                    var m = w.getClass().getMethod("getTaskId");
                    m.setAccessible(true);
                    /*
                     * ⚠️⚠️ **必须转成真正的 JS 数字**。invoke 返回的是 java.lang.Integer,
                     *    Rhino 里 `Integer(28468) !== Integer(28468)` 是 **true**
                     *    (对象不同),于是「任务号一样」也会被判成「跑到别的实例去了」。
                     *    踩过:核对实例那次,日志写着「任务号 28468,这一轮该在 28468」
                     *    却判失败,7 个角色全挂。>= 0 这种关系比较会自动转数字,
                     *    所以之前一直没暴露 —— 直到用上 !==。
                     */
                    return Number(m.invoke(w));
                } catch (e) { return -1; }
            }
        } catch (e) {}
        sleep(400);
    }
    return -1;
}

/*
 * 换操作对象之前**回桌面**。
 *
 * 【为什么非让开不可】
 *   换 user 时上一个实例还在前台,而它跟新目标**包名一样** —— 不让开的话
 *   `等到前台(腾讯包)` 会立刻返回 true(等于没等),深链就可能打在还没起来的
 *   实例上。先把腾讯挤下去,currentPackage() 就不再是腾讯;接着拉目标、
 *   等腾讯重新出现 —— 这时出现的必然是**新拉起的那个**。不依赖任何新 API。
 *
 * 【为什么是桌面,不是把我们自己的界面拉出来】
 *   ⚠️ 原先拉的是本 App 的界面,用户反馈**看着像跑完了** —— 满屏都是我们的主界面,
 *      谁也想不到它只是「让个位」。回桌面没有这个歧义:桌面上什么都没发生,
 *      而半透明控制条是系统级浮层,盖在桌面上照样看得见 ——
 *      「还在跑」这件事交给它说,而且暂停/停止在桌面上照样按得动。
 *   顺带还省掉一次启动自己 Activity(那本身也是一次抢前台)。
 *
 * ⚠️ home() 走无障碍的 GLOBAL_ACTION_HOME。个别机型/场景(锁定到某个应用、
 *    全屏游戏)会被拦,所以保留老办法当兜底 —— 宁可看着像跑完了,也不能不让开。
 */
function 先让开(下一步) {
    /*
     * 控制条上写明在换目标。
     * ⚠️ 写完**不还原** —— 还原就会把上一个目标的最后一个角色(「7/7 陆小凤」)
     *    重新挂回去,而接下来 唤醒腾讯 + 切号 可能要十几秒,那十几秒里
     *    条上显示的是**已经做完的那个号的进度**,比不写还糟。
     *    下一个目标进 跑一轮() 时会自己改成「0/N」。
     */
    进度号 = "换目标"; 进度名 = 下一步 || "…";
    刷新状态();

    var 让开了 = false;
    function 等让开() {
        for (var i = 0; i < 20; i++) {
            /*
             * ⚠️ 厂商的分身框一挂,currentPackage() 就不是腾讯了 —— 「让开了」会立刻成立,
             *    可框还在那儿。早点把它点掉,免得带进下一步。
             */
            过分身框();
            if (String(currentPackage()) !== String(腾讯包)) return true;
            sleep(300);
        }
        return false;
    }
    try {
        home();
        让开了 = 等让开();
    } catch (e) { 诊("回桌面出错:" + e); }
    if (!让开了) {
        诊("回桌面没成功,退回「把本应用拉到前台」让位");
        try {
            context.startActivity(本应用界面Intent());
            让开了 = 等让开();
        } catch (e) { 诊("先让开出错:" + e); }
    }
    /*
     * ⚠️ 停一下再拉下一个。桌面只闪一帧的话看着像卡了一下,反而更莫名其妙;
     *    停够看清「哦,它在换下一个」就行,一秒多的代价换一个说得清的画面。
     */
    if (让开了) sleep(1200);
    return 让开了;
}

/*
 * 这次要把 Intent 送到哪个 user。
 *
 * ⚠️ **本机也要返回 UserHandle,不能返回 null。** 2026-09-16 vivo 用户的日志:
 *    深链组件已经钉死成 `com.tencent.qqlive/.open.QQLiveOpenActivity`(真组件,
 *    不是选择器),**照样**弹出 `com.vivo.doubleinstance` 的分身选择框。
 *    也就是说 vivo 的「应用分身」是在 startActivity 这一层拦的:它看见目标包有分身,
 *    而调用方**没说要哪个 user**,就替用户问一句。
 *    把 user 显式说死,才是「没有歧义」这个信号 —— 普通 startActivity 表达不了。
 * ⚠️ 送到自己这个 user 不需要任何权限(同 user)。拿不到就返回 null,
 *    发Intent() 会退回普通 startActivity。
 */
function 目标UserHandle() {
    if (腾讯user === 我的user) {
        try { return android.os.Process.myUserHandle(); } catch (e) { return null; }
    }
    try {
        var la = context.getSystemService(android.content.Context.LAUNCHER_APPS_SERVICE);
        var ps = la.getProfiles();
        for (var i = 0; i < ps.size(); i++) {
            var uh = ps.get(i);
            if (String(uh).indexOf("{" + 腾讯user + "}") >= 0) return uh;
        }
    } catch (e) { 诊("找目标 UserHandle 出错:" + e); }
    诊("找不到 user " + 腾讯user + " 的 UserHandle");
    return null;
}
/*
 * ⚠️ 每个目标报一次「这次用的是哪种启动法」。
 *    不报的话,vivo 那边的日志就分不出「显式 user 这招没用」还是
 *    「这招根本没跑起来(方法被拦、退回了普通启动)」—— 两者要改的东西完全不同。
 */
var 报过启动法 = false;

function 发Intent(it) {
    var uh = 目标UserHandle();
    if (uh) {
        try {
            var m = context.getClass().getMethod("startActivityAsUser",
                        android.content.Intent.class, android.os.UserHandle.class);
            m.invoke(context, it, uh);
            if (!报过启动法) {
                报过启动法 = true;
                诊("启动法:startActivityAsUser(user " + 腾讯user + ")"
                   + " —— 把 user 说死了,看厂商的分身框还问不问");
            }
            return;
        } catch (e) {
            报过启动法 = true;
            诊("启动法:startActivityAsUser 用不了(" + e + "),退回普通 startActivity"
               + (腾讯user === 我的user ? "" : " —— 会落在本机那个"));
        }
    }
    if (!报过启动法) {
        报过启动法 = true;
        诊("启动法:普通 startActivity(拿不到 UserHandle)");
    }
    context.startActivity(it);
}

var 报过深链形状 = false;

function 开深链(url) {
    var it = new android.content.Intent(android.content.Intent.ACTION_VIEW,
        android.net.Uri.parse(url));
    var cn = 取深链组件(url);
    /*
     * ⚠️ **钉了组件就不再 setPackage。**
     *    组件本身已经把包名和类名都说死了,setPackage 是冗余的;
     *    而厂商的「应用分身」钩子很可能就是看 `intent.getPackage()` 判断
     *    「这个目标有没有分身」—— 不带它也许就绕过去了。
     *    这是**一注**,不是定论:绕不过去也没有副作用(显式组件照样精确路由),
     *    而且每轮日志会打「本轮分身框弹了几次」,跟上一版一比就知道有没有用。
     * ⚠️ 组件没解析出来(老系统 / 腾讯改结构)时**必须**留 setPackage,
     *    否则就成了隐式 Intent,系统选择器一定弹,比现在还糟。
     */
    if (cn) it.setComponent(cn);
    else it.setPackage(腾讯包);
    if (!报过深链形状) {
        报过深链形状 = true;
        诊("深链形状:" + (cn ? "只钉组件(不带 setPackage,试着绕开厂商分身框)"
                              : "只钉包名(组件没解析出来)"));
    }
    it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
    发Intent(it);            // ← 目标在别的 user(分身)时走 startActivityAsUser
}


/*
 * 先把腾讯视频叫到它**自己的首页**,再发深链。
 *
 * ⚠️⚠️ 这一步是**必须的,不是保险**。深链带 FLAG_ACTIVITY_NEW_TASK:腾讯当时要是没有任务栈
 *    (刚开机、被清理掉、被划掉),被深链拉起来的那一页就成了它整个任务的**根**。
 *    之后用户点桌面图标,系统去恢复这个任务,恢复出来的就是那一页 ——
 *    **实测切号页单独当根时渲染不出来,表现为白屏、腾讯视频「打不开」**,
 *    而且任务栈是持久的,重开手机也还在。用户原话:「腾讯 APP 似乎又唤不开了。」
 *    先用启动器 Intent 把首页顶成根,深链再叠在上面,就跟人手点进去完全一样。
 * ⚠️ 腾讯已经在跑的话,这一步只是把它切到前台,不花时间;冷启动那几秒本来也躲不掉。
 */
/*
 * 这一轮认定的「目标实例」的任务号。-1 = 还不知道(老系统读不到任务号)。
 *
 * ⚠️ 为什么需要它:**账号名证明不了我们在哪个实例里** —— 同一个账号完全可以
 *    同时登在本机和分身,那时两边的「页面账号」一模一样(2026-09-17 用户指出)。
 *    而任务是**按 user 分的**,本机和分身的腾讯永远在两个不同的 task 里
 *    (三星实测 28468 / 28469),跟登的是谁无关。
 */
var 本轮腾讯任务号 = -1;
var 说过没任务号 = false;

/*
 * 用 LauncherApps 把目标实例叫到前台。
 *
 * ⚠️ 为什么优先它,而不是 startActivity(启动器 Intent):
 *    它带**显式 UserHandle** —— 桌面自己开分身用的就是这条路,
 *    起来的是我们点名的那个实例,不用靠点框去决定。
 * ⚠️⚠️ **不要以为「厂商不问它」。** 我一度这么写过,被用户日志打脸:
 *    2026-09-17 vivo 的日志里,`唤醒腾讯` 这一步(走的就是 LauncherApps)照样弹了
 *    `com.vivo.doubleinstance`;分身那一轮弹的是 `com.vivo.appfilter`。
 *    判据是**日志顺序**:「腾讯到前台,任务号 N」是 等到前台() 返回之后才打的,
 *    而那个框是在 等到前台() 的循环里点掉的 —— 那时深链一行都还没发。
 * ⚠️ 它**带不了参数**,只能「把它叫起来」,深链还得另发 —— 那一条照样会被问。
 */
function 用启动器拉起() {
    try {
        var la = context.getSystemService(android.content.Context.LAUNCHER_APPS_SERVICE);
        var uh = 目标UserHandle();
        if (!la || !uh) return false;
        var al = la.getActivityList(腾讯包, uh);
        if (!al || al.size() === 0) return false;
        la.startMainActivity(al.get(0).getComponentName(), uh, null, null);
        return true;
    } catch (e) { 诊("LauncherApps 拉不起来(" + e + "),退回普通启动"); return false; }
}

function 唤醒腾讯(超时毫秒) {
    var 走的 = "";
    if (用启动器拉起()) {
        走的 = "LauncherApps(user 说死了)";
    } else {
        try {
            var it = context.getPackageManager().getLaunchIntentForPackage(腾讯包);
            if (!it) { 诊("唤醒腾讯:拿不到启动 Intent"); return false; }
            it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            发Intent(it);            // ← 目标在别的 user(分身)时走 startActivityAsUser
            走的 = "启动器 Intent";
        } catch (e) { 诊("唤醒腾讯出错:" + e); return false; }
    }
    var 成 = 等到前台(腾讯包, 超时毫秒 || 15000);
    if (成) {
        /*
         * ⚠️ 这一刻记下来的任务号,就是「这一轮该待的那个实例」。
         *    是用 LauncherApps 起的话它百分百可信(user 是我们指定的);
         *    退回普通启动的话,它至少还能发现「后来跑到另一个实例去了」。
         */
        本轮腾讯任务号 = 前台腾讯任务号();
        if (本轮腾讯任务号 >= 0)
            诊("腾讯到前台,任务号 " + 本轮腾讯任务号 + "(要的是 user " + 腾讯user
               + ",走的 " + 走的 + ")");
        else if (!说过没任务号) {
            说过没任务号 = true;
            诊("腾讯到前台(走的 " + 走的 + "),但这台机器读不到任务号"
               + "(Android 14 以下),只能靠账号名核对实例");
        }
    }
    return 成;
}

/*
 * 腾讯卡住时的补救:把它的页面栈整个清掉,以首页为根重开。
 * ⚠️ 用 CLEAR_TASK 而不是 force-stop —— 普通应用没有停止别人进程的权限。
 *    清栈能治「根是一张打不开的页面」这种状态,这正是上面那个坑留下的烂摊子。
 */
function 重置腾讯() {
    记("  腾讯视频没反应,清掉它的页面栈重开一次…");
    try {
        var it = context.getPackageManager().getLaunchIntentForPackage(腾讯包);
        if (!it) return false;
        it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                  | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK);
        发Intent(it);            // ← 目标在别的 user(分身)时走 startActivityAsUser
    } catch (e) { 诊("重置腾讯出错:" + e); return false; }
    sleep(2000);
    return 等到前台(腾讯包, 15000);
}

/**
 * 窗口列表里有没有这个包的窗口。单次,不 sleep。
 * ⚠️ 这是 currentPackage() 之外的**第二只眼**,见 等到前台() 那段注释。
 */
function 窗口里有(包名) {
    try {
        var ws = auto.service.getWindows();
        for (var i = 0; i < ws.size(); i++) {
            var r = null;
            try { r = ws.get(i).getRoot(); } catch (e) { continue; }
            if (r && String(r.getPackageName()) === String(包名)) return true;
        }
    } catch (e) {}
    return false;
}

/*
 * 等某个包到前台。
 *
 * ⚠️⚠️ **两条判据,不能只认 currentPackage()。**
 *    腾讯的**开屏广告页不给无障碍发事件** —— 实测冷启动碰上广告时:
 *      系统侧 `SplashHomeActivity` +585ms 就 resumed 了,
 *      而 currentPackage() **15 秒都还停在桌面上**。
 *    只认 currentPackage() 的话这 15 秒是纯空等(超时了才往下走),
 *    用户看到的现象就是「拉起腾讯之后在干等广告放完」。
 *    窗口列表(getWindows)是另一条路,广告页在不在里面看得见。
 */
function 等到前台(包名, 超时毫秒) {
    var 截止 = Date.now() + 超时毫秒;
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;        // 停止要立刻响应,不等这一轮超时
        if (currentPackage() === 包名) return true;
        if (窗口里有(包名)) return true;
        过分身框();     // ⚠️ 厂商的分身框会挡在这儿,不点掉就一直等到超时
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
        过分身框();
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
/* ══════════════ 厂商的「应用分身」选择框 ══════════════
 *
 * 【什么东西】
 *   vivo 用户 2026-09-16 的日志:深链已经钉死成腾讯的**真组件**
 *   (com.tencent.qqlive/.open.QQLiveOpenActivity),照样弹出
 *   **com.vivo.doubleinstance** 的框问「用哪个」。
 *   它不是 AOSP 的选择器(那个包名是 `android`),是厂商自己的 App,
 *   拦在 startActivity 这一层:目标包有分身、调用方又没说要哪个 user,就替用户问。
 *
 * 【为什么这段是「隔空写」的】
 *   开发机是三星,没有这个 App,**造不出这个框**。所以原则是:
 *     ① 先把框长什么样**原样抓进日志** —— 没有这个,下一轮改还是瞎猜
 *     ② 只在**认得出**的时候才替用户点:候选文字必须含腾讯的应用名。
 *        认不出宁可不动 —— 点错就是开了另一个实例,账号核对会判失败,查起来更乱。
 * ⚠️ 别把①删了只留②。真治好了也要留着,换个厂商就是另一套文案。
 */
/*
 * 厂商拦路框的包名关键字。**不止「选本机还是分身」那一个**。
 * vivo 实测有两个,长得完全不一样:
 *   · com.vivo.doubleinstance —— 「选择要使用的应用」,里面是 id=main / id=clone 两条
 *   · com.vivo.appfilter      —— 「"小菇爱表白"想要打开"腾讯视频"」,
 *                                 底下是「始终打开 / 仅打开一次 / 取消」
 * ⚠️ 2026-09-17 分身那一轮就栽在第二个上:关键字里没有它 → 认不出来 → 干等到超时
 *    → 「✗ 打不开切换账号面板」。加关键字这件事**比认框内结构更要紧**,
 *    认不出来的话后面那些聪明劲一点用都没有。
 */
var 分身框关键字 = ["doubleinstance", "dualinstance", "dualapp", "doubleapp", "clone",
                    "appfilter"];
/*
 * 已经抓过结构的框(按**包名**记)。
 * ⚠️ 原先是「一轮一个布尔开关」—— 第一个框抓完就关了,于是同一轮里**第二种框**
 *    一个节点都打不出来。vivo 有两个框(doubleinstance 和 appfilter),
 *    2026-09-17 那份日志里 appfilter 就只剩一行「点完前台是:com.vivo.appfilter」,
 *    等于没线索,白等一轮。每个包各抓一次:既不刷屏,又不会漏掉新面孔。
 */
var 抓过的框 = {};
var 点过分身框 = 0;        // 这一轮替用户点了几次(vivo 是每发一次深链弹一次,十几次很正常)
var 说过认不出 = {};       // 「认不出这个框该点哪」——按包名各说一次(同上)
var 遇框次数 = 0;          // 这一轮一共撞上几次框 —— 用来比较「不带 setPackage」有没有用
var 点掉了次数 = 0, 没点掉次数 = 0;   // ⚠️ 要分开记:分不清的话,「其实是用户自己手点的」这种事会被当成成功

function 是分身框(包) {
    var p = String(包 || "").toLowerCase();
    if (!p) return false;
    for (var i = 0; i < 分身框关键字.length; i++)
        if (p.indexOf(分身框关键字[i]) >= 0) return true;
    return false;
}

/** 把节点树里「有文字、有描述、或者可点」的节点摊平收出来。最多 40 个,够看了 */
function 摊平节点(n, 出) {
    if (!n || 出.length >= 40) return;
    var 文 = "", 描 = "", 类 = "", 号 = "", 可 = false;
    try { 文 = String(n.getText() || ""); } catch (e) {}
    try { 描 = String(n.getContentDescription() || ""); } catch (e) {}
    try { 类 = String(n.getClassName() || ""); } catch (e) {}
    // ⚠️ viewId 是最稳的判据:这台机器是日文系统,按文字认「仅此一次」会认成
    //    「1 回のみ」。AOSP 选择器那两颗钮的 id 固定是 android:id/button_once / button_always。
    try { 号 = String(n.getViewIdResourceName() || ""); } catch (e) {}
    try { 可 = n.isClickable(); } catch (e) {}
    if (文 || 描 || 可) {
        var r = new android.graphics.Rect();
        try { n.getBoundsInScreen(r); } catch (e) {}
        出.push({ 文: 文, 描: 描, 类: 类.replace("android.widget.", ""), 号: 号,
                  可: 可, 框: r, 点: n });
    }
    var c = 0;
    try { c = n.getChildCount(); } catch (e) {}
    for (var i = 0; i < c; i++) {
        var k = null;
        try { k = n.getChild(i); } catch (e) {}
        if (k) 摊平节点(k, 出);
    }
}

/** 那个框的窗口根节点。⚠️ 要按包名找窗口,rootInActiveWindow 未必是它 */
/*
 * 那个框的窗口根节点。
 * ⚠️ 必须按**包名相等**找,不能按关键字找。演练时按关键字找,抓到的是三星的
 *    边缘面板(它也在窗口列表里,包名里也带 android)—— 结果一个条目都没读到,
 *    还以为是框不给无障碍看。屏幕上同时有好几个窗口是常态,别猜。
 * ⚠️ rootInActiveWindow 只当兜底:框弹出来的那一瞬它可能还是上一个页面。
 */
function 分身框节点(包) {
    var 根 = null;
    try {
        var ws = auto.service.getWindows();
        for (var i = 0; i < ws.size(); i++) {
            var r = null;
            try { r = ws.get(i).getRoot(); } catch (e) { continue; }
            if (!r) continue;
            var p = "";
            try { p = String(r.getPackageName() || ""); } catch (e) {}
            if (p === String(包)) { 根 = r; break; }
        }
    } catch (e) {}
    if (!根) { try { 根 = auto.service.getRootInActiveWindow(); } catch (e) {} }
    var 出 = [];
    if (根) 摊平节点(根, 出);
    return 出;
}

/** 目标那个 App 在系统里叫什么(「腾讯视频」),用来在框里认条目 */
function 目标应用名() {
    try {
        var pm = context.getPackageManager();
        return String(pm.getApplicationLabel(pm.getApplicationInfo(腾讯包, 0)) || "");
    } catch (e) { return ""; }
}

/*
 * 选择框的「确认」钮。⚠️ 这类框是**两步**的:先点条目,再按一次确认 ——
 * 三星的系统选择器演练时就卡在这:条目点中了,框还在,因为还有
 * 「1 回のみ / 常時」(仅此一次 / 始终)没按。vivo 那个大概率也是这个套路。
 *
 * 认的顺序:
 *   ① viewId 带 once(AOSP 固定是 android:id/button_once)—— 跨语言最稳
 *   ② 文字/描述像「仅此一次」
 * ⚠️ **绝不点「始终」那颗**:它会把默认行为永久钉死,以后想操作另一个实例就麻烦了,
 *    而且用户没让我们改系统设置。认不出来就不点,把钮打进日志让用户自己按一下。
 */
var 只此一次词 = ["仅此一次", "只此一次", "仅一次", "仅打开一次", "打开一次", "本次",
                  "回のみ", "just once", "only once", "allow once"];
/*
 * 「始终打开 / 总是允许」那一颗。
 *
 * ⚠️ 对**跳转确认框**(「小菇爱表白想要打开腾讯视频」)要**优先点它**:
 *    它授的权就是这一对 App —— 而「让这个 App 去开腾讯视频」正是用户装它、
 *    按下「开始表白」时想要的事。按一次以后不再问;不按的话一轮要被打断几十次。
 *    (2026-09-17 维护者决定。撤销的路也留着:vivo 是 设置 → 应用与权限 → 跳转管控。)
 * ⚠️ 但**不要**拿它去点别的框:比如系统选择器的「始终」是给某个 scheme 定默认应用,
 *    范围比「这一对 App」大得多,而且对「同包名两个实例」根本无效
 *    (preferred activity 的键是 ComponentName,存不下 user)。
 *    所以只有走到「这框里没有 main/clone」那一支时才要永久。
 */
var 始终词 = ["始终", "总是", "常時", "always", "永远", "每次都"];
/*
 * ⚠️ 这些**绝不能点**。vivo 的「打开确认」框底下是「始终打开 / 仅打开一次 / 取消」——
 *    万一「仅打开一次」因为文案不同没认出来,而「取消」正好是唯一剩下的 Button,
 *    兜底逻辑就会去点它:框是消失了,腾讯**没打开**,然后无限重试。
 *    宁可不点、让用户自己按。
 */
var 别点词 = ["取消", "关闭", "cancel", "close", "不允许", "拒绝", "以后再说", "返回"];

var 说过始终提示 = false;

/** 框里有没有「始终/总是」那颗 —— 有的话提示用户自己点一次可以永久免掉 */
function 有始终那颗(条) {
    for (var i = 0; i < 条.length; i++) {
        var 全 = String(条[i].文 || "") + " " + String(条[i].描 || "");
        for (var a = 0; a < 始终词.length; a++) if (全.indexOf(始终词[a]) >= 0) return true;
    }
    return false;
}

function 找确认钮(条, 要永久) {
    var 钮 = [];
    /*
     * 要永久的话,**先找「始终打开」那颗**。找不到再退回「仅一次」——
     * 各家文案不一样,总不能因为没有「始终」就卡住。
     */
    if (要永久) {
        for (var p = 0; p < 条.length; p++) {
            var q = 条[p];
            if (!q.可) continue;
            var 文述 = (String(q.文 || "") + " " + String(q.描 || "")).toLowerCase();
            var 别 = false;
            for (var d = 0; d < 别点词.length; d++) if (文述.indexOf(别点词[d]) >= 0) 别 = true;
            if (别) continue;
            for (var a2 = 0; a2 < 始终词.length; a2++)
                if (文述.indexOf(始终词[a2]) >= 0 || String(q.号).indexOf("always") >= 0) return q;
        }
    }
    for (var i = 0; i < 条.length; i++) {
        var e = 条[i];
        if (!e.可) continue;
        var 全 = (e.文 + " " + e.描).toLowerCase();
        var 是始终 = false;
        for (var a = 0; a < 始终词.length; a++)
            if (全.indexOf(始终词[a]) >= 0 || String(e.号).indexOf("always") >= 0) 是始终 = true;
        if (是始终) continue;                       // 没要永久的话,「始终」不点
        var 别点 = false;
        for (var c = 0; c < 别点词.length; c++)
            if (全.indexOf(别点词[c]) >= 0 || String(e.号).indexOf("cancel") >= 0) 别点 = true;
        if (别点) continue;                         // ⚠️ 「取消」更不能点,见 别点词
        if (String(e.号).indexOf("once") >= 0) return e;
        for (var b = 0; b < 只此一次词.length; b++)
            if (全.indexOf(只此一次词[b]) >= 0) return e;
        if (e.类.indexOf("Button") >= 0) 钮.push(e);
    }
    return 钮.length === 1 ? 钮[0] : null;          // 只剩一颗没歧义;两颗以上不猜
}


/**
 * 手势点。⚠️ **落点是当场从这个节点身上读出来的**(getBoundsInScreen),
 *    不是写死的坐标 —— 换手机、换分辨率它自己会变。
 * ⚠️ 但手势终究是「打在屏幕某一点上,谁盖在上面谁收走」,所以它只能当**最后一招**:
 *    结构点(performAction)是直接投给那个节点的,不会被别的窗口截胡。
 * ⚠️ 派发之前把悬浮条设成不接收触摸,免得点到自己。
 */
function 手势点(项) {
    try {
        var r = new android.graphics.Rect();
        // 先 refresh 再读:框是几百毫秒前抓的,期间可能已经重排
        try { 项.点.refresh(); } catch (e) {}
        try { 项.点.getBoundsInScreen(r); } catch (e) { r = 项.框; }
        if (r.width() <= 0 || r.height() <= 0) r = 项.框;
        try { if (控制条) 控制条.setTouchable(false); } catch (e) {}
        var 成 = click(r.centerX(), r.centerY());
        try { if (控制条) 控制条.setTouchable(true); } catch (e) {}
        return !!成;
    } catch (e) { return false; }
}

/** 结构点:节点自己或最近的可点祖先。返回的只是「派发出去了」,**不代表有效** */
function 结构点(项) {
    var n = 项.点;
    for (var i = 0; i < 6 && n; i++) {
        var 可 = false;
        try { 可 = n.isClickable(); } catch (e) {}
        if (可) {
            try { if (n.performAction(16)) return true; } catch (e) {}   // 16 = ACTION_CLICK
        }
        try { n = n.getParent(); } catch (e) { break; }
    }
    return false;
}

/** 等那个框消失。等到了返回 true */
function 等框消失(毫秒) {
    var 截止 = Date.now() + (毫秒 || 1500);
    while (Date.now() < 截止) {
        if (!是分身框(currentPackage())) return true;
        sleep(150);
    }
    return !是分身框(currentPackage());
}

/*
 * 点框里的一条,并且**验证它真的被点掉了**。
 *
 * 顺序:**结构优先,手势垫底**。
 *   ① 结构点这一条(或它最近的可点祖先)
 *   ② 结构点它里面那个文字节点 —— 有的机型容器不吃、文字才吃
 *   ③ 都不行才手势,落点取自节点自己的 bounds
 *
 * ⚠️⚠️ 每一步都要**验框消没消失**。踩过大跟头:原先只看
 *    `performAction(ACTION_CLICK)` 的返回值就当成功 —— 那个值只代表**动作派发出去了**,
 *    如果那个 View 是自己处理触摸事件(不是 OnClickListener)就根本不响应。
 *    于是日志一片「无障碍点击」,实际每次都是用户自己手点掉的,我还拿它当修好了汇报。
 *    (2026-09-17 用户纠正。)**没验证过消失,就不算点掉。**
 */
function 点掉框里的(项) {
    if (结构点(项) && 等框消失(1200)) return "结构点掉了";
    if (项.文子 && 结构点(项.文子) && 等框消失(1200)) return "点文字点掉了";
    if (手势点(项) && 等框消失(1500)) return "手势点掉了(落点取自节点)";
    return "点了但框还在";
}

/**
 * 前台要是厂商的分身框,就抓结构 + 尽量替用户选。返回有没有点过。
 * ⚠️ 每轮循环都会调,所以前面那个判断必须极便宜(只比一次包名)。
 */
function 过分身框() {
    var 包 = String(currentPackage() || "");
    if (!是分身框(包)) return false;

    遇框次数++;
    var 条 = 分身框节点(包);
    if (!抓过的框[包]) {
        抓过的框[包] = true;
        记("  ⚠️ 撞上厂商的拦路框(" + 包 + "),原样抓下来:");
        for (var i = 0; i < 条.length && i < 24; i++) {
            var e = 条[i];
            记("    " + (i + 1) + ". 文[" + e.文 + "] 述[" + e.描 + "] " + e.类
               + (e.号 ? " id=" + e.号.replace(包 + ":id/", "") : "")
               + (e.可 ? " 可点" : "") + " (" + e.框.centerX() + "," + e.框.centerY() + ")");
        }
        if (!条.length) 记("    (一个节点都读不到 —— 这个框可能不给无障碍看)");
    }

    /*
     * ⚠️ 上限**不能设得小**。vivo 是**每发一次深链弹一次** —— 一轮 7 个角色、
     *    再加切号那几下,十几次是常态。原先写 2,第三次开始就撒手不管了。
     *    留个大数只是防跑飞(真跑到这个数说明点不动,再点也没用)。
     */
    if (点过分身框 >= 200) return false;
    var 要本机 = (腾讯user === 我的user);

    /*
     * 挑哪一条。两条路,先 id 后文字:
     *   ① **viewId**:vivo 自己标得清清楚楚 —— `…:id/main` 是本机、`…:id/clone` 是分身。
     *      这是 2026-09-17 用户日志里抓回来的,比按文字猜准得多:跨语言、
     *      跟应用名改不改无关,而且分身跟本机**显示名可能一模一样**(三星就是)。
     *   ② 认不出 id 才退回按应用名找,再取**文字最短**那条当本尊
     *      (分身的名字是在本尊上加东西,vivo 加「Ⅱ·」前缀)。
     */
    var 要 = null, 靠 = "";
    for (var i2 = 0; i2 < 条.length; i2++) {
        var 号 = String(条[i2].号 || "");
        if (!号) continue;
        var 尾 = 号.substring(号.lastIndexOf("/") + 1).toLowerCase();
        if (要本机 && (尾 === "main" || 尾 === "origin" || 尾 === "primary")) { 要 = 条[i2]; 靠 = "id " + 尾; break; }
        if (!要本机 && (尾 === "clone" || 尾 === "second" || 尾 === "dual")) { 要 = 条[i2]; 靠 = "id " + 尾; break; }
    }
    if (!要) {
        var 名 = 目标应用名();
        var 候 = [];
        for (var j = 0; j < 条.length; j++) {
            if (!名 || !条[j].文 || 条[j].文.indexOf(名) < 0) continue;
            /*
             * ⚠️ 只收**条目**,别把标题收进来。跳转确认框的标题是
             *    「"小菇爱表白"想要打开"腾讯视频"」—— 它也含应用名,收进来的话
             *    这个框会被误判成「有两条实例可选」,然后去点标题。
             *    条目的文字就是应用名本身(顶多加个「Ⅱ·」前缀),不会长出一截。
             */
            if (条[j].文.length > 名.length + 8) continue;
            候.push(条[j]);
        }
        if (候.length < 2) {
            /*
             * 没有「两条可选的实例」= 这多半**不是分身选择框**,而是另一种拦路框:
             * vivo 的 com.vivo.appfilter「XX 想要打开 YY」,底下是
             * 「始终打开 / 仅打开一次 / 取消」。
             *
             * ⚠️ 这一支要的是**永久** ——
             *    按一次「始终打开」以后就不再问,否则一轮被打断几十次。
             *    授的权只是「本 App 能打开腾讯视频」,正是用户按下「开始表白」要的事。
             */
            var 钮 = 找确认钮(条, true);
            if (钮) {
                点过分身框++;
                var 说一次 = 点过分身框 <= 2;
                if (说一次) 记("    这是「打开确认」框,替你按「" + (钮.文 || 钮.描) + "」");
                var 果 = 点掉框里的(钮);
                if (说一次 || 果.indexOf("还在") >= 0) 记("    结果:" + 果);
                if (果.indexOf("还在") < 0) { 点掉了次数++; } else { 没点掉次数++; }
                if (!说过始终提示 && 有始终那颗(条)) {
                    说过始终提示 = true;
                    记("    💡 按的是「始终打开」,授权范围只是「本 App 可以打开腾讯视频」,"
                       + "以后不再问。想撤销:系统设置里找「应用分身 / 跳转管控」那一项");
                }
                return 果.indexOf("还在") < 0 ? "点掉" : "没点掉";
            }
            if (!说过认不出[包]) {
                说过认不出[包] = true;
                记("    认不出这个框该点哪(没有 main/clone,也没找到能按的那类按钮)"
                   + " —— 请自己点一下。上面那份结构就是它,复制日志发给维护者");
            }
            return false;
        }
        var 短 = 候[0];
        for (var k = 1; k < 候.length; k++) if (候[k].文.length < 短.文.length) 短 = 候[k];
        要 = 短; 靠 = "文字最短";
        if (!要本机) for (var m = 0; m < 候.length; m++) if (候[m] !== 短) { 要 = 候[m]; 靠 = "文字非最短"; break; }
    }
    点过分身框++;
    // ⚠️ 第 2 次之后不再刷日志:一轮十几次的话,日志会被这几行淹掉
    /*
     * 条目本身多半没文字(文字在它的子节点上),备一个「里面那个文字节点」——
     * 有的机型点容器不吃、点文字才吃。
     */
    要.文子 = null;
    if (!要.文) {
        for (var t = 0; t < 条.length; t++) {
            if (条[t] === 要 || !条[t].文) continue;
            if (要.框.contains(条[t].框)) { 要.文子 = 条[t]; break; }
        }
    }
    var 要说 = 点过分身框 <= 2;
    if (要说) 记("    替你点" + (要本机 ? "本机" : "分身") + "那条(靠 " + 靠
                + ((要.文 || (要.文子 && 要.文子.文)) ? ",文字「" + (要.文 || 要.文子.文) + "」" : "") + ")");
    var 结果 = 点掉框里的(要);
    if (要说 || 结果.indexOf("还在") >= 0) 记("    结果:" + 结果);
    var 点掉了 = 结果.indexOf("还在") < 0;
    if (点掉了) 点掉了次数++; else 没点掉次数++;
    sleep(1200);

    /*
     * ⚠️ 这类框是**两步**的:点完条目框还在,要再按一次「仅此一次」。
     *    演练(三星系统选择器)就卡在这一步 —— 少了它等于白点。
     */
    if (是分身框(currentPackage())) {
        var 条2 = 分身框节点(String(currentPackage()));
        var 钮 = 找确认钮(条2);
        if (钮) {
            记("    框还在,再按一下「" + (钮.文 || 钮.描) + "」:" + 点掉框里的(钮));
        } else {
            记("    框还在,但认不出「仅此一次」那颗 —— 请自己按一下。框里的钮:");
            for (var n = 0; n < 条2.length; n++)
                if (条2[n].可 && (条2[n].文 || 条2[n].描))
                    记("      [" + 条2[n].文 + "/" + 条2[n].描 + "]"
                       + (条2[n].号 ? " id=" + 条2[n].号 : ""));
        }
    }
    // ⚠️ 这行也要收敛:一轮几十次弹框,不 gate 的话日志里全是它(用户那份就是)
    if (要说) 记("    点完前台是:" + currentPackage());
    return 点掉了 ? "点掉" : "没点掉";
}

function 去角色页(链, 页面名, 总超时) {
    try { 开深链(链); } catch (e) { 记("  发深链出错:" + e); return null; }
    var 截止 = Date.now() + 总超时;
    var 重发 = 0, 上次重发 = Date.now();
    while (Date.now() < 截止) {
        if (控制.中止) throw 中止信号;
        var f = 页面指纹();
        if (f && f !== 上一个指纹 && 确认是这个角色(页面名)) return f;
        /*
         * ⚠️ 点掉框之后**把重发计时器往后推**。
         *    不推的话:框刚点掉 → 2.2 秒到了 → 又发一条深链 → **又弹一次框**,
         *    自己跟自己打架,一个角色能弹三四次。
         *    刚点掉的那一下,链接多半已经被送进去了,给它时间落地。
         */
        if (过分身框() === "点掉") 上次重发 = Date.now();
        if (Date.now() - 上次重发 > 2200 && 重发 < 3) {
            重发++; 上次重发 = Date.now();
            var 前包 = String(currentPackage() || "?");
            var 现在 = (前包 === String(腾讯包))
                ? String(currentActivity() || "?").replace("com.tencent.qqlive.ona.activity.", "")
                : ("别的App:" + 前包);
            记("  还没到位(" + 现在 + "),重发深链");
            // ⚠️ 框本身由 过分身框() 处理(抓结构 + 尽量替用户点),这里只多给一句出路
            if (是分身框(前包))
                记("     (框里有「记住/默认」就勾上;也可以到系统设置的「应用分身」里关掉询问)");
            try { 开深链(链); } catch (e) {}
        }
        sleep(250);
    }
    return null;
}

function 签一个内部(角色) {
    记("── " + 角色.名 + " ──");

    /*
     * ⚠️ 后面那两个参数**不是冗余的,别删**。
     *    只带 topic_id 的话页面进得去(Activity 确实是 TopicFeedsPageActivity),
     *    但渲染不出来 —— 显示「当前网络不稳定 / 错误码:-1000000」,点重试变全白。
     *    看起来像网络问题,其实是腾讯不知道这一页该按哪种版式渲染。
     *    2026-09-15 实测:同一个 topic_id,少参数必白屏,补上立刻正常。
     */
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

    /*
     * 先核对**实例**,再核对账号。
     *
     * ⚠️ 顺序不能反,而且账号那道**不能当实例判据用** —— 同一个账号可以同时登在
     *    本机和分身,那时两边账号名一样,账号核对全程放行,我们却可能在错的实例上表白。
     *    任务号跟登的是谁无关:任务按 user 分,两个实例永远是两个 task。
     * ⚠️ 读不到任务号(Android 14 以下)就静默放行 —— 老机器上退回只靠账号核对,
     *    比直接判失败强。
     */
    if (本轮腾讯任务号 >= 0) {
        var 现任务 = 前台腾讯任务号();
        if (现任务 >= 0 && 现任务 !== 本轮腾讯任务号) {
            return "失败:这一页在另一个腾讯实例上(任务号 " + 现任务 + ",这一轮该在 "
                 + 本轮腾讯任务号 + ")—— 多半是分身选择框被点到了另一条";
        }
    }

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
        // 同 去角色页:刚点掉框就别急着重发,不然又弹一次
        if (过分身框() === "点掉") 上次发 = Date.now();
        /*
         * ⚠️⚠️ 切号这条路**也**会撞上厂商的分身选择框 —— 面板本身就是一条深链。
         *    2026-09-17 vivo 用户的日志:第一个号跑完 7 个角色都成了,切第二个号时
         *    「✗ 切号超时」,3 个号只跑成 1 个 —— 就是因为这儿没人去点那个框。
         *    别以为「去角色页里处理过了」就够:每一条发深链之后的等待循环都要过一遍。
         */
        sleep(300);
    }
    // ⚠️ 超时别直接放弃:多半是腾讯的页面栈坏了(见 唤醒腾讯 那段)。清栈重开再试一轮。
    if (!已重置过) {
        已重置过 = true;
        if (重置腾讯()) {
            sleep(1500);
            return 开切号面板(超时毫秒);
        }
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
        过分身框();          // 框盖在面板上时,读到的永远是 0 行
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
    /*
     * ⚠️⚠️ 收尾**必须无论怎么退出都跑到**。原来有三个出口绕过了它:
     *   ① 打不开面板 return ② 读不到账号行 return ③ 用户按停止(throw 中止信号)
     * 后果不只是「没有通知」——
     *   **`多账号进行中` 停在 true 没复位**(它原来写在 while 之后)。
     *   于是下一次哪怕只跑单号,跑一轮() 结尾那句 `if (多账号进行中) return;` 照样生效:
     *   又是没结果、没通知、App 也不切回前台。**这个坏状态会一直粘着**,
     *   直到某次多账号完整跑完为止。用户实测:「在第一个号第一个角色表白时停止,就没动作了。」
     * 所以:主体整个包进 try,状态复位放 finally,收尾放在外面,三条路都走得到。
     */
    var 完成数 = 0, 行们 = [], 中止了 = false, 没开成 = "";
    try {
    if (!开切号面板()) { 记("✗ 打不开切换账号面板"); 没开成 = "打不开切换账号面板"; }
    else {
        行们 = 稳读账号面板();
        if (行们.length === 0) { 记("✗ 面板上读不到账号行(解析失败?)"); 没开成 = "面板上读不到账号行"; }
    }
    if (!没开成) {

    记("本轮共 " + 行们.length + " 个账号:");
    行们.forEach(function (r) { 记("  · " + r.名 + (r.当前 ? "  ← 当前登录" : "")); });

    var 用UID = 有重名(行们);
    if (用UID) 记("⚠️ 列表里有重名,改用账号ID 认身份(每次切完多读一个页面)");

    var 做过 = {}, 保险 = 行们.length * 3;
    var 当前行 = null;
    for (var i = 0; i < 行们.length; i++) if (行们[i].当前) 当前行 = 行们[i];

    // ① 先跑一开始就登着的那个
    var 身份 = 用UID ? 读当前UID() : (当前行 ? 当前行.名 : "(未知)");
    记("");
    轮次前缀 = "1/" + 行们.length + " ";
    当前账号名 = 当前行 ? 当前行.名 : "";
    账号进度 = "1/" + 行们.length;
    账号名显示 = 当前行 ? 当前行.名 : "?";
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
        账号进度 = (完成数 + 1) + "/" + 行们.length;
        账号名显示 = 目标.名;                 // 切之前就显示,切号那十几秒才有东西看
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

    }   // if (!没开成)
    } catch (e) {
        if (e !== 中止信号) throw e;          // 真异常照旧往上抛,别吞掉
        中止了 = true;
        记("");
        记("■ 用户中止");
    } finally {
        // ⚠️ 状态复位放这儿,不放主体末尾 —— 中止是 throw 出去的,走不到末尾
        多账号进行中 = false;
        轮次前缀 = ""; 当前账号名 = "";
        账号进度 = ""; 账号名显示 = "";
    }

    记("");
    // 一行一个号。通知用的是 BigTextStyle,界面上是多行 text,都吃换行。
    var 换行 = String.fromCharCode(10);
    var 总摘要;
    if (没开成) {
        总摘要 = "✗ " + 没开成;
        记("=== 多账号没跑成:" + 没开成 + " ===");
    } else {
        总摘要 = (中止了 ? "已中止 · " : "") + "共 " + 完成数 + "/" + 行们.length + " 个账号";
        if (轮摘要.length) 总摘要 += 换行 + "· " + 轮摘要.join(换行 + "· ");
        记("=== 多账号" + (中止了 ? "已中止" : "结束") + ":" + 完成数 + "/" + 行们.length + " 个账号 ===");
    }
    上次结果 = 总摘要;
    try { if (偏好) 偏好.put("上次结果", 总摘要); } catch (e) {}
    收尾前台();                               // 跑完、中止、没跑成,都要收尾(最后一个目标才切回 App)
    发结果通知(没开成 ? "表白没跑成" : (中止了 ? "表白已中止" : "多账号表白完成"), 总摘要);
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
    // ⚠️ 只有真撞上过才报 —— 没有分身的机器上这行是噪音
    if (遇框次数)
        诊("本轮撞上厂商分身框 " + 遇框次数 + " 次:我们点掉 " + 点掉了次数
           + " 次,没点掉 " + 没点掉次数 + " 次(没点掉的是你自己手点的)");
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
    收尾前台();
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
// ⚠️ 也要在这里定一次操作对象 —— 它要读偏好,而 偏好 是文件末尾才赋值的。
//    不做的话界面上那一行会一直显示「还没选」,直到用户按下开始才算出来。
try { 定目标们(); } catch (e) { 诊("初始化操作对象出错:" + e); }
刷新状态();
建通知渠道();
首次问通知();
