# AGENTS — CookieCloud

## 目录（地图）

- 本仓库职责：CookieCloud 核心服务与浏览器插件协同仓库
- 入口文档：`README.md` / `README_cn.md`
- 业务边界：`api/` 与 `extension/` 为主要入口，`web/`/`docker/`/`design/`/`ext/` 作为支持/发布面

## 运行与交付（最小导航）

- Run：见 `README.md` 的运行示例
- Test：看 `README.md`（当前以仓库内说明为准），缺失时可补 `pytest` 或 `npm`/`yarn` 对应最小检测
- Build：`lzc-cli project build`
- Deploy：`lzc-cli app install`（或仓库推荐流程）

## 约束

- 配置与端口使用应保持与部署清单一致
- 变更应同步体现在 `README` 与 `lzc-*` 文件
