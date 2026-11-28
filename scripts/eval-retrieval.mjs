/**
 * Lumina Reader 自动化评测与边界验证套件（零新增依赖，复用 Vite 内置 esbuild）。
 *
 * 覆盖三个维度：
 * 1. Suite A（20 条）：中英文长文档本地检索对比评测
 *    对比「无索引头部截断」vs「纯 BM25」vs「当前视窗 + BM25 混合策略」的召回命中率与上下文控本效率
 * 2. Suite B（8 条）：PDF / 流式文本划词清洗边界用例（cleanSelectedText）
 * 3. Suite C（6 条）：划词模式自动分流与 Prompt 约束校验（detectSelectionMode / buildTranslatePrompt）
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function loadAppModules() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-eval-'));
  const entryPath = path.join(tmpDir, 'entry.ts');
  const outPath = path.join(tmpDir, 'bundle.mjs');

  const docIndexPath = path.join(projectRoot, 'src/utils/docContextIndex.ts').replace(/\\/g, '/');
  const cleanerPath = path.join(projectRoot, 'src/utils/textCleaner.ts').replace(/\\/g, '/');
  const promptsPath = path.join(projectRoot, 'src/services/prompts.ts').replace(/\\/g, '/');

  fs.writeFileSync(
    entryPath,
    [
      `export * from '${docIndexPath}';`,
      `export * from '${cleanerPath}';`,
      `export * from '${promptsPath}';`,
    ].join('\n'),
    'utf-8',
  );

  await esbuild.build({
    entryPoints: [entryPath],
    outfile: outPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  });

  const mod = await import(pathToFileURL(outPath).href);
  return { mod, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}

/**
 * 14 章节中英文混合长文档（约 12,000+ 字符），模拟真实 AI 系统设计与论文阅读场景。
 */
const EVAL_MARKDOWN = `# Modern Local-First AI Reading & Agent Architecture · 本地优先 AI 阅读与智能体系统设计

## 1. 引言与本地优先设计哲学

在桌面端与浏览器环境中构建阅读工具时，传统云端文档服务往往要求用户上传整本 PDF 或 EPUB 到远程服务器，这不仅引入了明显的网络往返延迟，也让学术未公开手稿与企业内部文档面临隐私泄露风险。本地优先（Local-First）架构主张所有原始字节流、批注记录、高亮定位与会话历史全部持久化于本地设备的 IndexedDB，仅在用户主动触发伴读或翻译请求时，将最小必要上下文发送至模型接口。

为了避免阅读过程被弹窗与复杂工具栏打断，低侵扰（Low-Friction）界面遵循「静默退场、按需呼应」原则：常态下仅保留纸张质感版心与柔和页边距，只有在文本被划选或用户展开侧栏时才浮现轻量化交互入口。

从工程演进角度看，早期云端阅读器往往将文档解析、全文搜索和笔记存储全部集中在后端集群。这种中心化设计在弱网环境、航班离线场景以及企业内网隔离环境中几乎完全失效，而且随着用户书库增长，服务端存储与带宽成本呈线性攀升。将存储与计算下沉到终端设备之后，单机即可承载数百份文献的即时打开与毫秒级检索，把云端能力严格收敛到「按需推理」这一单一职责上。

## 2. 四格式文档纯本地解析流水线

不同文档格式的底层结构差异极大，解析层必须在零后端的前提下统一抽象为可检索的段落流。PDF 文件通过 pdfjs-dist 逐页渲染 Canvas 与透明文本层，并引入归一化比例坐标（0~1）记录多段高亮矩形，使缩放窗口或调整 DPI 时划线位置绝不漂移。

EPUB 电子书放弃了传统的 iframe 沙箱隔离方案，改用 JSZip 解包后解析 container.xml、OPF 清单与 EPUB3 nav.xhtml 或 EPUB2 toc.ncx 目录，将章节 XHTML 经 DOMPurify 净化后直接挂载至原生流式 DOM，并将内部相对路径图片转为 Blob URL 统一排版，使 EPUB 与 Markdown 共享同一套划词、批注与搜索能力。DOCX 则由 mammoth 转换为语义 HTML 段落流。

实践中最容易踩坑的是不同排版引擎对章节锚点与图片相对路径的约定差异。例如部分老旧电子书在 OPF 中采用非标准的相对回溯路径，或在 XHTML 中混用自闭合标签与内联样式表。解析管线在挂载 DOM 前会统一归一化路径基准、剥离冲突的固定字体声明与绝对定位样式，确保各类来源的文档进入阅读视图后都服从统一的版心宽度、行高与配色令牌。

## 3. PDF 文本层噪声与跨行断词清洗

学术 PDF 的文本层在双栏排版中普遍存在三类高频噪声：其一是英文单词在行尾被连字符强行截断（例如 "compre-\\nhension" 或 "architec-\\nture"），若直接送入词典或翻译模型会导致严重误译；其二是双栏渲染时 PDF 字符间距被 pdfjs 识别为孤立空格，导致中文出现「注 意 力 机 制」这类字间断裂；其三是不可见的软连字符（U+00AD）与零宽空白符污染关键词匹配。

针对上述问题，文本清洗器在保留真实双换行段落结构的前提下，按规则区分小写续接的英文断词（直接合并）与大写开头的复合专有名词（保留连字符仅去换行），同时仅在 PDF 模式下合并连续汉字之间的孤立单空格，避免破坏普通 Markdown 中的刻意排版。

此外，在多栏学术论文中，PDF 文本项的坐标顺序偶尔会出现跨栏交错或页眉页脚混入正文的干扰。通过以页面为单位抽取文本项并根据 hasEOL 标志重建视觉行，再送入统一的 cleanSelectedText 流水线规整，既服务了实时指尖划词，也直接提升了底层检索分块的纯净度，避免页内断词把一个完整英文术语切碎成两个无效词元。

## 4. 零外部向量库的 BM25 本地索引设计

引入外部向量数据库（如 Chroma 或 Milvus）或下载数百 MB 的本地 Embedding 模型会显著抬高桌面端安装包体积与冷启动门槛。对于单本书籍或长篇论文（通常在 5 千至 30 万字区间），纯前端构建的词法倒排索引配合 BM25（k1=1.5, b=0.75）能够在毫秒级完成全书建索引与检索。

为了让中英文混合技术文档同时获得高召回，轻量分词器对英文执行小写化、停用词过滤与轻量词干归并（处理 -ies / -ing / -ed / -es / -s 后缀），对中文则切分双字 n-gram 并保留 2~4 字完整短词，兼顾了专业术语的精确命中与泛化召回，而无需内置数兆体积的分词词典。

在分块粒度控制上，索引器以约 500 字符为目标长度、660 字符为硬上限对同一章节或同一页内的短段落进行自然聚合并保留章节元数据标签。过小的分块容易导致上下文碎片化、丢失主语与前提条件，而过大的分块则会迅速挤占单次问答的字符预算；500 字符左右的段落块在学术论文与技术书籍中恰好对应一到两个完整论述单元。

## 5. 阅读视窗与全书检索的混合拼装策略

在长文档伴读中，用户的提问天然分为两类：一类是带有强烈指代色彩的局部问题（例如「这里提到的核心矛盾是什么」「作者为什么反对这种做法」），其答案完全位于当前阅读位置附近；另一类是跨章节关联问题（例如在读第 10 章时追问第 3 章提出的数据结构或实验参数），单靠局部视窗必然答非所问。

因此，检索管线将最大上下文预算（默认 5,000 字符）切分为两部分：先依据当前页码或滚动进度比例定位锚点块，向两侧扩展约 1,500~1,650 字符构成「当前阅读位置附近内容」；随后将视窗内已选块加入排除集合，在全书剩余分块中运行 BM25 取 Top 4 相关段落作为「全书检索相关段落」，既杜绝重复拼接，又将每次问答的 Token 成本稳定压在可控上限之内。

为了防止极端情况下某一块文本异常冗长而把检索段落全部挤出预算，拼装器对视窗区间设定了占总预算 42% 且不超过 1,650 字符的软上限，确保至少留出过半预算给跨章节高分命中段落。同时，所有输出片段都会附上章节标题或页码标签，帮助模型在回答时给出可追溯的出处线索。

## 6. 划词分流：语境词典与原位译文

当读者在英文论文中划选文本时，如果划中一个生词或二三词术语（如 "epistemic patience" 或 "inductive bias"），用户期望看到的是音标、词性与结合当前句意的精炼释义；而当划选内容是一整段长难句时，强行输出词典模板反而显得啰嗦。

分流函数通过四道低开销规则完成判定：无换行、长度不超过 36 字符、不含句末或分句标点、由 1~3 个合法英文词元组成即进入「语境词典」模式并强制三行紧凑 Markdown 流式输出；其余情况统一进入「原位译文」模式，严禁模型输出开场白、引号或「译文：」前缀，确保悬浮卡片在视线上与正文浑然一体。

在界面交互层，划词弹窗会自动捕获选区前后各约 360 字符作为隐式语境传入提示词，同时在界面上只展示干净译文而不把上下文回显给用户。用户阅读完悬浮释义后，既可以点击空白处瞬间退场，也可以一键存为双语笔记或送入右侧栏继续追问语法结构与背景论证。

## 7. 多模型档案库与场景化延迟路由

不同阅读子任务对模型能力与首字延迟（TTFT）的诉求截然不同。伴读深聊与全文导读需要较强的长文本综合推理能力，而指尖划词翻译更看重 500ms 内的瞬时响应。

系统允许用户在本地维护多条 OpenAI 兼容或 Google Gemini 模型档案（内置小米 MiMo、Google Gemini、DeepSeek、OpenAI、OpenRouter 与本地 Ollama/vLLM 端点预设），并分别为「伴读答疑」和「划词翻译」绑定独立模型档案；针对具备混合思考（Hybrid Thinking）特性的模型，支持在划词场景下显式关闭思考链路以显著缩短首字等待时间。

这种双槽位路由设计让用户无需在「高智能高延迟」与「低延迟浅理解」之间做单项妥协：例如将快速轻量模型或关闭思考模式的端点绑定至划词翻译，把旗舰推理模型绑定至右侧伴读栏，从而在成本、速度与回答深度之间取得最佳平衡。

## 8. 超长文档全文导读的均匀抽样压缩

对于超过 18,000 字符的整本电子书或百页白皮书，直接将全文塞进单次导读请求不仅成本高昂，还容易触发模型的中间遗忘（Lost in the Middle）现象。

导读抽样器在文档超过阈值时自动切换为结构化压缩策略：保留不超过 2,200 字符的完整目录（TOC）、前 3,000 字符的开篇导言、末尾 2,000 字符的结语收束，并在剩余预算内对中间章节执行等步长均匀抽样，将总输入严格封顶在 15,000 字符以内，同时保证目录骨架与核心论点不丢真。

生成后的导读结果会自动缓存在本地 IndexedDB 中，再次打开同一文档时无需重复消耗 Token；当用户切换模型或希望从不同视角重新提炼重点时，也支持手动一键重新生成导读并覆盖旧缓存。

## 9. 主动回忆闪卡与批注知识沉淀

单纯的划线高亮往往制造「虚假熟练感」，真正能将外部文本内化为长期记忆的机制是主动回忆（Active Recall）。用户在选中核心概念或段落时，可一键调用闪卡生成提示词，基于上下文自动提炼「聚焦单一概念、答案精炼在 3 句以内」的问答卡片。

所有双语划词摘录、三色高亮批注与闪卡均关联到文档唯一 ID 与章节锚点，支持一键导出为结构干净的 Markdown 复习笔记，方便直接导入 Obsidian 或 Notion 个人知识库。

为避免导出笔记沦为杂乱无章的摘抄堆砌，导出器按「原文摘录 → 对应译文或批注 → 关联问答闪卡」的层级自动归类，并保留文档标题、导出时间戳与章节位置标记，让阅读过程中的零散灵感顺滑转化为长期可检索的知识资产。

## 10. 桌面端 Tauri v2 跨端工程与安全隔离

在纯浏览器环境中，前端直接请求第三方大模型 API 常常遭遇 CORS 跨域拦截，而引入云端反向代理又违背了 API Key 不离本机的安全承诺。Tauri v2 桌面外壳通过集成 tauri-plugin-http 在 Rust 原生层发起请求，彻底绕开浏览器 CORS 限制且保持端到端直连厂商接口。

此外，应用集成 tauri-plugin-window-state 记忆窗口尺寸与坐标，并通过 externalLink 拦截器确保文档内任意外部超链接均交由系统默认浏览器安全打开，避免 WebView 意外跳离阅读视图。

相较传统 Electron 动辄上百 MB 的运行时打包体积，Tauri v2 复用系统原生 WebView2，使最终 Windows NSIS 安装包体积保持在极轻量级，冷启动与内存占用也更贴合常驻后台的轻量阅读工具定位。

## 11. 密钥隐私保护与轻量级备份恢复

所有模型 API Key 仅存储在当前设备的本地存储中，不经过任何第三方中转服务器。数据管理模块支持将书库元信息、高亮批注、多话题伴读记录、闪卡及阅读偏好打包导出为单一 JSON 备份文件，导入时采用按 ID 合并去重策略。

在导出序列化阶段，代码通过显式字段白名单严格剥离全部 apiKey 字段，保证用户把备份文件同步到网盘或跨设备分享时绝不会发生凭证泄露。

恢复备份时，系统会先校验 JSON 结构版本与必要字段完整性，按记录 ID 比对本地已有数据后执行无损合并而非粗暴覆盖，同时向界面返回新增与跳过的明细统计，防止误操作导致近期笔记丢失。

## 12. 护眼排版、主题切换与 PDF 暗黑图表保护

长时间盯着高对比度纯白屏幕容易引发视觉疲劳，应用内置纯白（Light）、暖黄护眼（Sepia）与暗黑深灰（Dark）三套配色令牌，并纯本地打包 Source Serif 4、Newsreader 与 DM Sans 三款开源可变字体，彻底离线可用且支持字号、行高与版心宽度（620px / 740px / 900px）实时调节。

针对科研 PDF 在暗黑模式下「全页反色导致彩色热力图与实验照片失真」的经典痛点，应用额外提供「低亮原色（Dim）」模式，通过温和降亮滤镜保护彩色论文图表原貌，同时保留「柔和反色（Invert）」供纯文字书籍深夜阅读。

首屏加载前，内联脚本会抢在 React 挂载之前读取本地主题偏好并写入 HTML 根节点属性，彻底消除暗黑模式下切换页面或重启应用时的「白屏闪烁（FOUC）」问题。

## 13. 错误边界兜底与离线容错设计

面对损坏的 PDF 交叉引用表、编码异常的 EPUB 章节文件或网络波动导致的 SSE 流式中断，前端构建了分层容错机制：单页 PDF 文本提取失败时自动跳过该页而不中断全书索引构建；AI 流式响应支持 AbortController 随时中止且保留已生成的半截译文；顶层则由 React ErrorBoundary 兜底，防止局部渲染异常导致整页白屏。

对于接口超时、模型名配置错误或额度不足等常见异常，客户端会将底层 HTTP 状态码与提供商错误体翻译为明确的人话提示与一步直达设置页的引导按钮，避免用户在黑盒报错面前无所适从。

## 14. 演进方向：迈向多端协同与语音伴读

面向未来的多终端阅读场景（桌面端、平板与移动端），轻量化本地索引与场景化模型路由的设计范式可以无缝迁移：在移动端利用端侧小模型承接即时划词与离线摘要，在桌面端利用云端强模型进行跨文档深度综合；同时可进一步拓展低侵扰语音伴读与多文档交叉检索能力，让深度阅读体验贯穿碎片与整块时间。

随着端侧算力与紧凑多模态模型的成熟，未来的阅读伴侣不仅能回答文字段落里的疑问，还能够在离线状态下直接理解论文中的公式推导与统计图表，把「安静地阅读，自然地思考」延伸到更广泛的个人知识工作流之中。
`;

const EXTRA_HANDBOOK_SECTIONS = `
## 附录 A. 浏览器 IndexedDB 事务模型与大文件分片持久化

在现代浏览器与 WebView2 环境中，localStorage 的单源配额通常被严格限制在 5 MB 左右，且采用同步阻塞式读写，完全无法承载动辄数十兆字节的科研 PDF 或带高分辨率插图的 EPUB 电子书。IndexedDB 提供了异步事务模型与数百兆至数 GB 级别的本地持久化能力，成为本地优先文档阅读器的核心存储基座。

在表结构设计上，应将高频读取的书架元信息（标题、格式、阅读进度、最近打开时间、字数统计）与低频读取的二进制原文件（ArrayBuffer）拆分至不同的对象仓库（Object Store）。否则每次返回首页渲染书架列表时，浏览器都必须把全部书籍的二进制大对象反序列化进内存，造成首屏卡顿与内存峰值飙升。拆表后，首页查询只需扫描轻量索引记录，仅在用户真正点击某本书进入阅读器时才按主键按需加载其二进制内容。

## 附录 B. 可变字体排版度量与长文视觉节奏

屏幕阅读体验的疲劳感往往并非来自文字本身，而是源于不合理的行长（Measure）、行高（Leading）与字重对比。印刷排版学研究表明，中文长文在每行 32 至 42 个汉字、行高 1.65 至 1.85 倍字号区间内，人眼扫视回行时的定位误差最低；而英文长文的最佳行长则在 60 至 75 个字符左右。

将 Source Serif 4、Newsreader 与 DM Sans 等开源可变字体（Variable Fonts）通过字体子集打包进本地静态资源，可以彻底摆脱海外字体 CDN 在国内弱网环境下的加载阻塞与超时回退。借助光学尺寸轴（opsz）与无级字重轴（wght），同一套字体文件就能在标题、正文、引用块与注脚之间呈现出细腻的纸书层次。

## 附录 C. SSE 流式响应解析与中断恢复工程细节

在调用大语言模型进行划词翻译或伴读答疑时，全量等待响应完成再一次性渲染会带来数秒的空白焦灼感。Server-Sent Events（SSE）协议允许服务端以增量分块推送生成内容，前端只需在 ReadableStream 上维护一个行缓冲区，按双换行边界拆分事件帧并解析 data 前缀后的 JSON 负载即可实现打字机级别的逐字呈现。

工程落地中必须妥善处理两类边界情况：一是单次网络数据包可能恰好把一个 UTF-8 多字节汉字或一行 JSON 截成两半，因此必须使用带 stream 标志的 TextDecoder 并在缓冲区保留未闭合尾行；二是用户快速划选新句子或主动点击停止时，需立即触发 AbortController 取消在途请求，并把已生成的部分内容安全落盘，避免状态错乱或幽灵流覆盖当前卡片。

## 附录 D. 桌面端文件拖拽、编码探测与安全沙箱

本地文档的来源五花八门，用户可能直接从邮件客户端、文献管理器或文件夹拖拽任意后缀的文件进入应用窗口。前端导入器必须在解析前同时检查文件扩展名与基础魔数结构，并在 DOMPurify 清洗阶段剥离内嵌的 script 标签、危险事件处理器以及可疑的外部跟踪像素，确保打开来历不明的 EPUB 或 HTML 片段时不会触发跨站脚本执行。

对于纯文本与 Markdown 文件，还需兼容 UTF-8 BOM 头与不同操作系统的换行符约定（CRLF 与 LF）。在解析阶段统一规范化换行符并过滤零宽控制字符，能够避免后续正则切段、高亮偏移定位和全文检索出现难以复现的错位故障。

## 附录 E. 前端离线检索的内存占用与冷启动性能分析

在客户端构建全文倒排索引时，内存占用主要来自两处：原始分块文本数组与词项到文档频率的映射表。实测表明，一本十万字级别的技术专著经 500 字分块后大约产生 220 个分块，中英文双字 n-gram 词表规模约在 3 万至 5 万个不重复词元之间，整个索引结构的常驻内存开销仅在数兆字节量级，建索引耗时通常低于 40 毫秒。

相比在浏览器中加载动辄 50 MB 以上的 ONNX 嵌入模型并占用数百兆 WebAssembly 堆内存，轻量词法 BM25 索引在绝大多数中低配笔记本上都能实现零感知的瞬间响应。配合按文档 ID 缓存与 Promise 去重机制，即便用户在短时间内连续发送多条伴读追问，也不会重复触发 PDF 文本提取与索引重建。

## 附录 F. 批注锚点消歧与跨会话数据一致性

当用户在长篇文档中划选一个常见短语（例如「注意力机制」或「梯度下降」）并添加批注时，如果仅记录选中文本本身，在下次重新打开文档还原高亮时很容易错误命中正文中第一次出现的同名词汇。为此，选区提取器在保存批注时会同步记录选中文本前后各 32 字符的上下文锚点（prefix 与 suffix），并在还原 DOM 高亮时按前后缀匹配度打分消歧。

在多话题伴读场景下，同一本书可能同时存在「逐章精读」「论文复现疑问」「面试考点梳理」等多条独立对话线程。将话题元信息、消息列表与文档主键通过外键逻辑关联，并把最后活跃话题 ID 持久化至本地，可让用户在多本书之间频繁切换时无缝回到上次中断的思考现场。

## 附录 G. 跨平台快捷键、焦点管理与无障碍细节

专注型阅读器在桌面端需要像原生系统软件一样顺手：按下 Escape 键应当按层级优先关闭最顶层的设置弹窗或划词浮层，而不是直接退出文档；在输入框内键入内容时应自动屏蔽全局翻页快捷键，防止误触；侧栏展开或收起时应保持当前正文视口的阅读位置稳定，避免因版心宽度变化造成段落大幅跳动。

在无障碍对比度方面，三套主题均须确保正文文字与背景满足 WCAG AA 以上的对比度标准，同时为所有纯图标按钮补充清晰的 aria-label 与悬停提示文本，让键盘用户与高分屏用户都能获得一致的清晰反馈。

## 附录 H. 多厂商模型协议差异与错误码翻译

尽管行业内多数模型厂商声称兼容 OpenAI Chat Completions 接口，但在实际联调中仍存在诸多细微差异：例如部分厂商要求思考模式开关通过顶层字段传递，而另一些提供商将其放在推理参数对象中；Google Gemini 原生接口则采用完全不同的内容结构、角色命名（model 而非 assistant）与 SSE 路径约定。

模型适配层将不同协议的请求构造、流式增量抽取与错误体解析收口至统一抽象函数，上层伴读组件与划词组件无需关心底层对接的是小米 MiMo、Gemini、DeepSeek 还是本地 Ollama 端点。当请求返回 401 鉴权失败、404 模型不存在或 429 频控限流时，错误翻译器会给出明确可操作的排查指引。

## 附录 I. 面向科研论文与技术书籍的阅读工作流建议

在实际使用中，建议将整本书或长论文的精读拆分为三个阶段：第一阶段打开全文导读快速建立章节地图，明确哪些章节需要精读、哪些只需略览；第二阶段进入专注模式顺读正文，遇到生词与复杂长句使用原位划词译文保持阅读心流不被打断，仅在出现核心概念冲突时打开右侧伴读栏追问；第三阶段基于阅读期间随手积累的高亮批注与主动回忆闪卡，一键导出 Markdown 复习文档沉淀到个人长期知识库中。

这套「先鸟瞰结构 → 再低侵扰精读 → 最后结构化沉淀」的闭环，正是 Lumina Reader 全部功能取舍背后的统一产品主线。
`;

const FULL_EVAL_DOC = `${EVAL_MARKDOWN}\n\n${EXTRA_HANDBOOK_SECTIONS}`;

// 20 条评测用例：覆盖远距离跨章检索（14 条）+ 当前视窗局部指代问答（6 条）
const RETRIEVAL_CASES = [
  // --- 跨章节检索（读到文档开头或末尾时，追问遥远章节的精确细节） ---
  {
    id: 'R01',
    type: 'cross-chapter',
    query: 'EPUB 为什么放弃 iframe，怎么处理目录和内部图片？',
    progressRatio: 0.92,
    expectedKeywords: ['DOMPurify', 'toc.ncx', 'Blob URL'],
  },
  {
    id: 'R02',
    type: 'cross-chapter',
    query: 'PDF 文本层有哪些常见噪声，怎么处理英文断词和中文空格？',
    progressRatio: 0.88,
    expectedKeywords: ['软连字符', '复合专有名词', '孤立单空格'],
  },
  {
    id: 'R03',
    type: 'cross-chapter',
    query: 'BM25 的 k1 和 b 参数是多少，中英文分词怎么做的？',
    progressRatio: 0.95,
    expectedKeywords: ['k1=1.5', '双字 n-gram', '词干归并'],
  },
  {
    id: 'R04',
    type: 'cross-chapter',
    query: '划词分流如何区分语境词典模式和原位译文模式？',
    progressRatio: 0.95,
    expectedKeywords: ['36 字符', '语境词典', '原位译文'],
  },
  {
    id: 'R05',
    type: 'cross-chapter',
    query: '如何解决划词翻译的首字延迟和混合思考耗时问题？',
    progressRatio: 0.05,
    expectedKeywords: ['小米 MiMo', '混合思考', '500ms'],
  },
  {
    id: 'R06',
    type: 'cross-chapter',
    query: '超长文档超过 18000 字时全文导读怎么抽样压缩？',
    progressRatio: 0.05,
    expectedKeywords: ['15,000 字符', 'Lost in the Middle', '均匀抽样'],
  },
  {
    id: 'R07',
    type: 'cross-chapter',
    query: '主动回忆闪卡和笔记如何导出到 Obsidian？',
    progressRatio: 0.05,
    expectedKeywords: ['Active Recall', 'Obsidian', '3 句以内'],
  },
  {
    id: 'R08',
    type: 'cross-chapter',
    query: 'Tauri v2 桌面端是怎么绕开 CORS 跨域限制的？',
    progressRatio: 0.05,
    expectedKeywords: ['tauri-plugin-http', 'CORS', 'Rust'],
  },
  {
    id: 'R09',
    type: 'cross-chapter',
    query: 'JSON 数据备份怎么确保 API Key 不泄露？',
    progressRatio: 0.05,
    expectedKeywords: ['白名单', 'apiKey', '合并去重'],
  },
  {
    id: 'R10',
    type: 'cross-chapter',
    query: '暗黑模式下彩色论文图表失真怎么解决？',
    progressRatio: 0.05,
    expectedKeywords: ['低亮原色', 'Dim', '彩色热力图'],
  },
  {
    id: 'R11',
    type: 'cross-chapter',
    query: '内置了哪三款开源可变字体，版心宽度有哪些档位？',
    progressRatio: 0.05,
    expectedKeywords: ['Source Serif 4', 'Newsreader', '740px'],
  },
  {
    id: 'R12',
    type: 'cross-chapter',
    query: '单页 PDF 提取失败或流式中断怎么容错兜底？',
    progressRatio: 0.05,
    expectedKeywords: ['AbortController', 'ErrorBoundary', '跳过该页'],
  },
  {
    id: 'R13',
    type: 'cross-chapter',
    query: 'PDF 缩放或改 DPI 时高亮为什么不会漂移？',
    progressRatio: 0.9,
    expectedKeywords: ['归一化比例坐标', 'pdfjs-dist', 'Canvas'],
  },
  {
    id: 'R14',
    type: 'cross-chapter',
    query: '批注还原时怎么防止常见短语错误命中第一次出现的词？',
    progressRatio: 0.05,
    expectedKeywords: ['prefix', 'suffix', '消歧'],
  },
  // --- 局部视窗指代问答（真实读者泛指提问，不含原章节特有词，强依赖当前阅读进度锚点） ---
  {
    id: 'R15',
    type: 'viewport-deictic',
    query: '请用通俗语言总结一下这里讲的核心意思。',
    progressRatio: 0.02,
    expectedKeywords: ['Local-First', 'IndexedDB'],
  },
  {
    id: 'R16',
    type: 'viewport-deictic',
    query: '作者这一段为什么要改用现在的实现方式？',
    progressRatio: 0.08,
    expectedKeywords: ['DOMPurify', '流式 DOM'],
  },
  {
    id: 'R17',
    type: 'viewport-deictic',
    query: '能帮我把当前这段提到的几个痛点列出来吗？',
    progressRatio: 0.14,
    expectedKeywords: ['连字符', '软连字符'],
  },
  {
    id: 'R18',
    type: 'viewport-deictic',
    query: '这部分提到的取舍逻辑我没太看懂，能展开解释吗？',
    progressRatio: 0.34,
    expectedKeywords: ['TTFT', '500ms'],
  },
  {
    id: 'R19',
    type: 'viewport-deictic',
    query: '能解释一下当前这一节的设计是怎么保障安全性的吗？',
    progressRatio: 0.54,
    expectedKeywords: ['白名单', 'apiKey'],
  },
  {
    id: 'R20',
    type: 'viewport-deictic',
    query: '文章结尾给出的实践建议应该按什么顺序执行？',
    progressRatio: 0.97,
    expectedKeywords: ['三阶段', '低侵扰精读'],
  },
];

function isHit(contextText, expectedKeywords) {
  const lower = contextText.toLowerCase();
  const matched = expectedKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
  // 至少命中一半以上核心证据词（对 2 词需 >= 1，对 3 词需 >= 2）
  return matched.length >= Math.ceil(expectedKeywords.length * 0.6);
}

/**
 * 对照基线 2：纯 BM25（不拼接当前视窗，按相同预算取 Top-K）
 */
function pureBm25Retrieve(index, tokenizeForSearch, query, maxChars) {
  const queryTokens = tokenizeForSearch(query);
  const N = index.chunks.length;
  const k1 = 1.5;
  const b = 0.75;
  const avgdl = Math.max(1, index.avgChunkLen);
  const norm = query.trim().toLowerCase();

  const scored = [];
  for (const chunk of index.chunks) {
    let score = 0;
    const dl = Math.max(1, chunk.tokens.length);
    for (const q of new Set(queryTokens)) {
      const tf = chunk.tokenFreq.get(q) ?? 0;
      if (tf === 0) continue;
      const df = index.docFreq.get(q) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgdl))));
    }
    if (norm.length >= 3 && chunk.text.toLowerCase().includes(norm)) score += 3.5;
    if (score > 0) scored.push({ chunk, score });
  }
  scored.sort((a, b2) => b2.score - a.score);

  let out = '';
  for (const { chunk } of scored.slice(0, 6)) {
    const entry = `[${chunk.meta}] ${chunk.text}\n\n`;
    if (out.length + entry.length <= maxChars) out += entry;
  }
  return out.trim();
}

async function main() {
  const { mod, cleanup } = await loadAppModules();
  try {
    const {
      buildMarkdownContextIndex,
      retrieveContextForQuery,
      sampleDocumentForGuide,
      tokenizeForSearch,
      cleanSelectedText,
      detectSelectionMode,
      buildTranslatePrompt,
    } = mod;

    // ==================== Suite A: 检索对比评测 ====================
    const index = buildMarkdownContextIndex('eval-doc', FULL_EVAL_DOC);
    const fullChars = FULL_EVAL_DOC.length;
    const BUDGET = 2800;

    let headHits = 0;
    let pureBm25Hits = 0;
    let hybridHits = 0;
    let hybridCrossHits = 0;
    let hybridViewportHits = 0;
    let pureBm25ViewportHits = 0;
    let totalHybridChars = 0;

    const failedHybrid = [];

    for (const tc of RETRIEVAL_CASES) {
      const headCtx = FULL_EVAL_DOC.slice(0, BUDGET);
      const pureCtx = pureBm25Retrieve(index, tokenizeForSearch, tc.query, BUDGET);
      const hybridRes = retrieveContextForQuery(index, {
        query: tc.query,
        progressRatio: tc.progressRatio,
        maxChars: BUDGET,
      });

      assert.ok(
        hybridRes.contextText.length <= BUDGET,
        `[${tc.id}] 检索上下文超过预算 ${BUDGET}: ${hybridRes.contextText.length}`,
      );
      totalHybridChars += hybridRes.contextText.length;

      const h1 = isHit(headCtx, tc.expectedKeywords);
      const h2 = isHit(pureCtx, tc.expectedKeywords);
      const h3 = isHit(hybridRes.contextText, tc.expectedKeywords);

      if (h1) headHits += 1;
      if (h2) {
        pureBm25Hits += 1;
        if (tc.type === 'viewport-deictic') pureBm25ViewportHits += 1;
      }
      if (h3) {
        hybridHits += 1;
        if (tc.type === 'cross-chapter') hybridCrossHits += 1;
        if (tc.type === 'viewport-deictic') hybridViewportHits += 1;
      } else {
        failedHybrid.push(tc.id);
      }
    }

    const total = RETRIEVAL_CASES.length;
    const avgHybridChars = Math.round(totalHybridChars / total);
    const savedPct = (((fullChars - avgHybridChars) / fullChars) * 100).toFixed(1);

    // 验证导读抽样严格封顶
    const bigDoc = Array.from({ length: 6 }, (_, i) => `## 扩展卷 ${i + 1}\n\n${EVAL_MARKDOWN}`).join('\n\n');
    const bigIndex = buildMarkdownContextIndex('big-doc', bigDoc);
    const sampled = sampleDocumentForGuide(bigIndex, '1. 引言\n2. 解析\n3. 检索');
    assert.ok(sampled.length <= 15000, `导读抽样超限: ${sampled.length}`);

    // ==================== Suite B: 划词清洗边界测试（8 条） ====================
    const cleanerCases = [
      {
        name: '英文小写跨行连字符断词合并',
        fn: () => assert.equal(cleanSelectedText('reading compre-\nhension in papers', true), 'reading comprehension in papers'),
      },
      {
        name: '大写复合专有名词保留连字符',
        fn: () => assert.equal(cleanSelectedText('model GPT-\n4o and Tauri-\nV2', true), 'model GPT-4o and Tauri-V2'),
      },
      {
        name: '中文视觉硬换行无缝拼接',
        fn: () => assert.equal(cleanSelectedText('本地优先的\n阅读架构设计', true), '本地优先的阅读架构设计'),
      },
      {
        name: 'PDF 汉字间孤立空格清洗',
        fn: () => assert.equal(cleanSelectedText('注 意 力 机 制 与 检 索', true), '注意力机制与检索'),
      },
      {
        name: '非 PDF 保留普通空格',
        fn: () => assert.equal(cleanSelectedText('注 意 力', false), '注 意 力'),
      },
      {
        name: '清除软连字符与零宽空白符',
        fn: () => assert.equal(cleanSelectedText('local\u00ADfirst\u200Breader\uFEFF', true), 'localfirstreader'),
      },
      {
        name: '保留真实双换行段落结构',
        fn: () => assert.equal(cleanSelectedText('第一段内容。\n\n第二段内容。', true), '第一段内容。\n\n第二段内容。'),
      },
      {
        name: '中文标点邻接换行拼接与多空格规整',
        fn: () => assert.equal(cleanSelectedText('核心原则：\n\t保持\u00A0\u00A0克制。', true), '核心原则：保持 克制。'),
      },
    ];
    for (const c of cleanerCases) c.fn();

    // ==================== Suite C: 划词分流与 Prompt 约束（6 条） ====================
    const promptCases = [
      {
        name: '单个英文词进入 word 词典模式',
        fn: () => assert.equal(detectSelectionMode('epistemic'), 'word'),
      },
      {
        name: '2-3 词英文术语进入 word 词典模式',
        fn: () => assert.equal(detectSelectionMode('chain-of-thought prompting'), 'word'),
      },
      {
        name: '含标点完整英文句进入 sentence 译文模式',
        fn: () => assert.equal(detectSelectionMode('Context shapes meaning.'), 'sentence'),
      },
      {
        name: '超 36 字符短语进入 sentence 译文模式',
        fn: () => assert.equal(detectSelectionMode('very long english academic phrase exceeding limit'), 'sentence'),
      },
      {
        name: '中文短语与多行文本进入 sentence 模式',
        fn: () => {
          assert.equal(detectSelectionMode('语境词典'), 'sentence');
          assert.equal(detectSelectionMode('deep\nreading'), 'sentence');
        },
      },
      {
        name: 'Prompt 模板格式与禁开场白约束校验',
        fn: () => {
          const w = buildTranslatePrompt('epistemic patience', 'epistemic patience precedes genuine synthesis');
          assert.equal(w.mode, 'word');
          assert.ok(w.systemPrompt.includes('**语境释义：**'));
          assert.ok(w.systemPrompt.includes('绝不添加开场白'));

          const s = buildTranslatePrompt('Deep reading is a deliberate dialogue.', '');
          assert.equal(s.mode, 'sentence');
          assert.ok(s.systemPrompt.includes('只输出中文译文本身'));
        },
      },
    ];
    for (const c of promptCases) c.fn();

    console.log('=== Lumina Reader Eval & Boundary Suite ===');
    console.log(`文档规模: ${fullChars} 字符 / ${index.chunks.length} 分块 | 单次检索预算上限: ${BUDGET} 字符`);
    console.log('');
    console.log('| 检索策略 | 总命中率 (20条) | 局部指代命中 (6条) | 跨章检索命中 (14条) |');
    console.log('| --- | --- | --- | --- |');
    console.log(`| 无索引头部截断 | ${headHits}/${total} (${((headHits / total) * 100).toFixed(1)}%) | - | - |`);
    console.log(`| 纯 BM25 检索 | ${pureBm25Hits}/${total} (${((pureBm25Hits / total) * 100).toFixed(1)}%) | ${pureBm25ViewportHits}/6 | ${pureBm25Hits - pureBm25ViewportHits}/14 |`);
    console.log(`| 视窗 + BM25 混合（Lumina） | ${hybridHits}/${total} (${((hybridHits / total) * 100).toFixed(1)}%) | ${hybridViewportHits}/6 | ${hybridCrossHits}/14 |`);
    console.log('');
    console.log(`平均输入上下文: ${avgHybridChars} 字符（相比全文输入节省 ${savedPct}% 上下文开销）`);
    console.log(`超长文档导读抽样: ${bigDoc.length} 字符 -> ${sampled.length} 字符（上限 15,000）`);
    console.log(`Suite B 划词清洗边界: ${cleanerCases.length}/${cleanerCases.length} PASS`);
    console.log(`Suite C 分流与 Prompt 约束: ${promptCases.length}/${promptCases.length} PASS`);
    if (failedHybrid.length > 0) {
      console.log(`未命中用例: ${failedHybrid.join(', ')}`);
    }

    // 硬断言：混合检索命中率必须 >= 90%，且显著优于头部截断与纯 BM25
    assert.ok(hybridHits / total >= 0.9, `混合检索命中率低于 90%: ${hybridHits}/${total}, 未命中: ${failedHybrid.join(', ')}`);
    assert.ok(hybridHits > headHits, '混合检索必须优于无索引头部截断');
    assert.ok(hybridHits > pureBm25Hits, '混合检索必须优于纯 BM25（因覆盖局部指代问答）');
    console.log('ALL SUITES PASSED.');
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
