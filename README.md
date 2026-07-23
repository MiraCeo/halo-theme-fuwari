<h1 align="center">Halo Theme Fuwari MiraCeo</h1>

---

<div align="center">

一款适用于 [Halo 2](https://github.com/halo-dev/halo) 的博客主题。<br />
本项目是 [Jiewenhuang/halo-theme-fuwari](https://github.com/jiewenhuang/halo-theme-fuwari) 的维护分支，由 MiraCeo 修改和维护；原 Halo 主题移植自 [saicaca/fuwari](https://github.com/saicaca/fuwari)。

</div>

<p class="badge-row" align="center">
  <a href="https://halo.run" target="_blank">
    <img src="https://img.shields.io/badge/dynamic/yaml?label=Halo&query=%24.spec.requires&url=https://raw.githubusercontent.com/MiraCeo/halo-theme-fuwari/main/theme.yaml&color=113,195,71" alt="Halo"/>
  </a>
  <a href="https://github.com/MiraCeo/halo-theme-fuwari/releases" target="_blank">
    <img src="https://img.shields.io/github/v/release/MiraCeo/halo-theme-fuwari" alt="Release"/>
  </a>
  <a href="https://github.com/MiraCeo/halo-theme-fuwari/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/github/license/MiraCeo/halo-theme-fuwari" alt="MIT License">
  </a>
</p>

## 本分支更新

- 将 Halo 主题唯一标识改为 `theme-fuwari-miraceo`，可与原版 `theme-fuwari` 同时安装，更新本分支时不会覆盖原主题。
- 独立主题设置、ConfigMap、静态资源路径和编辑器 UI 插件绑定，避免两个主题共享配置或错误加载资源。
- 后台主题颜色支持 `#RGB`、`#RRGGBB` 和 `rgb(r, g, b)` 格式，并在首屏加载前转换主题色相。
- 保留对旧版数字 `hue` 配置的兼容；颜色输入无效时会安全回退到旧配置或默认值。
- 更新主题元数据、仓库链接和页脚链接，由 MiraCeo 继续维护。

## 预览

![image](./screenshot/home.png)

## 安装

从当前仓库的 [Releases](https://github.com/MiraCeo/halo-theme-fuwari/releases) 下载主题压缩包，然后在 Halo Console 的主题管理页面上传安装。该分支会作为 `theme-fuwari-miraceo` 独立安装。

## 插件支持

Fuwari 主题支持以下 Halo 插件：

- [x] 搜索插件：https://www.halo.run/store/apps/app-DlacW
- [x] 评论插件：https://www.halo.run/store/apps/app-YXyaD
- [x] 瞬间插件：https://www.halo.run/store/apps/app-SnwWD
- [x] 图库插件：https://www.halo.run/store/apps/app-BmQJW
- [x] 链接管理插件：https://www.halo.run/store/apps/app-hfbQg

## 使用说明

> 1、部分功能是使用插件进行支持

- [x] 卡片化设计
- [x] 响应式主题
- [x] 深色模式
- [x] 文章目录
- [x] [代码高亮/语言/复制](https://github.com/halo-sigs/plugin-shiki)（插件）
- [x] [文章搜索](https://github.com/halo-sigs/plugin-search-widget)（插件）
- [x] [评论系统](https://github.com/halo-sigs/plugin-comment-widget)（插件）
- [x] [友情链接](https://github.com/halo-sigs/plugin-links)
- [x] 图库（/photos）：https://halo.run/store/apps/app-BmQJW
- [x] 瞬间（/moments）：https://halo.run/store/apps/app-SnwWD
- [x] 文章目录
- [x] i18n国际化
- [x] 其他功能

## 开发

```bash
git clone https://github.com/MiraCeo/halo-theme-fuwari.git
cd halo-theme-fuwari
```

```bash
pnpm install
```

```bash
pnpm dev
```

## 贡献

如需反馈当前维护分支的问题或参与改进，请前往本仓库：

- [提交 Issue](https://github.com/MiraCeo/halo-theme-fuwari/issues)
- 提交 Pull Request

<br>

## 致谢与来源

本项目建立在以下开源项目和作者的工作之上：

- [Jiewenhuang/halo-theme-fuwari](https://github.com/jiewenhuang/halo-theme-fuwari)：本维护分支直接基于该 Halo 主题修改。感谢 Jiewenhuang 完成移植与持续开发。
- [saicaca/fuwari](https://github.com/saicaca/fuwari)：原始 Astro Fuwari 主题。感谢 saicaca 的设计与实现。
- [Halo](https://halo.run)：主题运行平台及相关开发能力。

同时感谢下列 Halo 插件项目提供的功能支持：

- [plugin-links](https://github.com/halo-sigs/plugin-links)
- [plugin-comment-widget](https://github.com/halo-sigs/plugin-comment-widget)
- [plugin-search-widget](https://github.com/halo-sigs/plugin-search-widget)

本分支遵循原项目的 [MIT License](./LICENSE)。原项目已有的版权声明与许可证内容均予以保留；本分支的维护者信息不代表对原作者身份或版权归属的替代。

## 原项目相关资源

以下资源由原项目作者提供，可能与本维护分支的支持范围不同：

- [原项目预览：Jiewen's Blog](https://www.jiewen.run/?preview-theme=theme-fuwari)
- 原项目 QQ 交流群：929708466
- [TinyTale Halo 2 配套小程序](https://www.jiewen.run/archives/TinyTale-formal-edition)

![QQ群](./screenshot/qqGroup.jpg)

![TinyTale](./screenshot/tinytale.png)
