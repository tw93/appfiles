<div align="center">
  <h1>appfiles</h1>
  <p><b>一份开放规范，说清楚 App 在你电脑上留下了哪些文件，每个是什么</b></p>
  <p><a href="README.md">English</a> · 中文</p>
  <p>
    <a href="SPEC.md">规范正文</a> ·
    <a href="appfiles.md">Agent 步骤</a> ·
    <a href="appfiles.schema.json">Schema</a> ·
    <a href="reserved.json">保留名单</a> ·
    <a href="tests/vectors.json">一致性测试</a> ·
    <a href="CHANGELOG.md">更新记录</a>
  </p>
  <a href="SPEC.md"><img src="https://img.shields.io/badge/spec-0%20draft-555?style=flat-square" alt="Spec 0，草案"></a>
  <a href="https://github.com/tw93/appfiles/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/tw93/appfiles/test.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://github.com/tw93/appfiles/stargazers"><img src="https://img.shields.io/github/stars/tw93/appfiles?style=flat-square" alt="Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://x.com/HiTw93"><img src="https://img.shields.io/badge/follow-Tw93-red?style=flat-square&logo=x" alt="Twitter"></a>
</div>

<br/>

<p align="center">
  <img src="assets/appfiles.svg" alt="一份 appfiles.json，列出 App 的路径，每条标一种类型" width="1000" />
</p>

## 为什么做 appfiles

备份、迁移、清理和卸载工具，每一个都在猜哪些文件属于某个 App，丢了要不要紧。现在最接近答案的是 Homebrew 的 `zap` 列表，一个 App 一个 App 手写，只管 Mac，而且里面缓存和聊天记录长得一模一样。

真正知道答案的是做这个 App 的人，`appfiles.json` 让他们在安装包里写一次，macOS、Windows、Linux 都能写，任何工具都能读。

## 怎么开始

**你在做 App**，对你的 Coding Agent 说：

```text
Read https://raw.githubusercontent.com/tw93/appfiles/main/appfiles.md and add appfiles.json to this app.
```

它会读你的源码，补上框架悄悄写的路径，把 App 跑起来对一遍，再把文件放进安装包。Electron、Tauri、Swift、Go、.NET、WinUI、Qt、Flutter、C++ 都覆盖了。

**你在做读取 App 的工具**，规则在[规范第 9 节](SPEC.md#9-readers)，第一条就是这个文件来自它描述的 App 本身，可以增加候选和标签，但永远不能扩大你的工具能动的范围。

[`reserved.json`](reserved.json) 和 [`tests/vectors.json`](tests/vectors.json) 都是纯数据，不管用 Swift、C# 还是别的语言写读取方，用的都是同一份名单，跑的也是同样的用例。

**你想校验一份文件或者看看一个 App**，不用克隆仓库也没有依赖，Node 18 以上就行：

```bash
npx github:tw93/appfiles appfiles.json
npx github:tw93/appfiles /Applications/Example.app
```

给它文件就校验，给它 App 就是参考读取方，会拿文件和安装包的身份核对，拒掉不合规的条目，把剩下的列出来，并标明每条在这台机器上有没有。核对身份要在 macOS 上，因为它问的是系统的 `plutil`。给它放着这个文件的目录也一样，只是不核对身份。它只读，不做任何操作，所以不跟随链接也不展开通配符，真要删东西的工具得先做这两步。

## 格式长什么样

```json
{
  "spec": 0,
  "name": "Example Notes",
  "macos": {
    "id": "com.example.notes",
    "paths": [
      { "path": "~/Library/Application Support/Example Notes", "kind": "data" },
      { "path": "~/Library/Caches/com.example.notes", "kind": "cache" },
      { "path": "~/Library/Preferences/com.example.notes.plist", "kind": "config" },
      { "path": "~/Documents/Example Notes", "kind": "user" }
    ]
  },
  "windows": {
    "id": "ExampleNotes",
    "paths": [
      { "path": "%APPDATA%\\Example Notes", "kind": "data" }
    ],
    "registrations": [
      { "type": "registry", "id": "HKCU\\Software\\Example\\Notes" }
    ]
  }
}
```

一共七种类型，从绝对不能丢排到自己会重建，两种都说得通时取靠上的那种。

| 类型 | 含义 |
|---|---|
| `user` | 用户自己放进去的文件 |
| `component` | 装在安装包外面的代码，比如辅助程序和插件 |
| `data` | 删了就没了，或者很难找回来 |
| `config` | 设置 |
| `state` | 窗口和会话状态 |
| `log` | 日志和崩溃报告 |
| `cache` | 自己会重建 |

## 为什么这样设计

- **只描述不执行**：没有脚本也没有命令，读这个文件不会运行任何东西
- **默认不信任**：一份坏文件可能写上别的 App 的目录，或者把数据库标成缓存，所以读取方要拿它和安装包的身份核对，自己的保护规则照旧，[一份共用名单](reserved.json)再拒掉常见的密钥、邮件和系统文件
- **位置固定**：Mac 上是 `Contents/Resources/appfiles.json`，Windows 上在 exe 旁边，工具只查一个路径，不需要索引
- **一份文件管所有平台**：一个 App 发三个系统，也只维护一份
- **Agent 来写，跑起来验证**：框架会写很多源码里看不到的文件，所以步骤最后一定要把 App 跑一遍对照

## 谁在用

下面这些 App 的源码里已经带上了这个文件，会跟着各自的下一个版本到用户手上：

| App | 平台 | 文件 |
|---|---|---|
| [Kaku](https://github.com/tw93/Kaku) | macOS | [`appfiles.json`](https://github.com/tw93/Kaku/blob/main/assets/macos/Kaku.app/Contents/Resources/appfiles.json) |
| [妙言](https://github.com/tw93/MiaoYan) | macOS | [`appfiles.json`](https://github.com/tw93/MiaoYan/blob/main/Resources/appfiles.json) |
| [Mole](https://mole.fit) | macOS、Windows | 在安装包里 |
| [Pake](https://pake.run) | macOS、Windows、Linux | 在安装包里 |
| [Hina](https://hina.day) | macOS | 在安装包里 |
| [Yado](https://yado.house) | macOS | 在安装包里 |

你的 App 也带上了的话，提个 issue 或 PR，我加进这张表。现在还没有工具读取这个格式，Mole 打算做第一个读取方。

## 现在到哪一步了

`spec: 0` 是草案，格式还可能变。目前是这样验证的：

- **盲测**：只给 Coding Agent 这份步骤，第一轮找到已知路径 73 条里的 61 条，第二轮换了 10 个新 App，找到 61 条里的 52 条，每轮之后都修了步骤。第二轮漏掉的 9 条看起来都是老版本的残留
- **macOS 实跑**：在测试机上打开 Kaku、妙言、Mole 和 Pake 再退出，没有登录，它们用自己名字写下的 46 条路径全部被覆盖。那台机器之前跑过这些 App，所以不算干净环境
- **Windows**：和长期使用的安装对比过，没有在干净环境跑
- **Linux**：还没实跑，这部分格式也还是草案

路径规则还用 Homebrew `zap` 列表里全部 21544 条不重复的路径跑过，靠它才没把第三方 App 放在苹果最近文稿目录里的文件误拒掉。之前规则接受的路径里，有 17 条现在是故意拒绝的，15 条在苹果自己的目录里，2 条写的是整个共享插件目录。这些验证发现的问题都记在[更新记录](CHANGELOG.md)里，碰到格式表达不了的情况，欢迎[提 issue](https://github.com/tw93/appfiles/issues)。

## 背景

我在做 [Mole](https://github.com/tw93/Mole)，一个 Mac 和 Windows 上的清理工具，为了把卸载做好测了 800 多款软件，发现每个软件放文件的方式都不一样，所以想有一个格式，让 App 自己说清楚文件在哪、都是什么。

开发者不用为这件事先去学一个格式，所以步骤是写给 Coding Agent 的，让 Agent 读一遍就好了。名字也改了几轮，毕竟做 App 的人都不希望自己的 App 里躺着一个带卸载字样的文件。

我没指望它很快普及，所以先从自己的几个 App 开始带上。

## License

MIT License，欢迎使用和参与开发。
