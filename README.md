# gist-sync-api

> 与github [gist](https://gist.github.com/)加密同步数据，可用于网站cookie同步；
>
> 按照[SyncMyCookie](https://github.com/Andiedie/sync-my-cookie)方式借助[kevast.js](https://github.com/kevast/kevast.js)实现加解密和连接gist；
>
> 可供于其它设备、语言使用接口。

## 安装
### Node.js
```bash
npm install
```



## 配置

目录下创建 **.env** 文件参考 **.env.example** 填写环境变量

- token: github token，建议只勾选gist
- password: 加密密钥，尽量复杂
- gistId: gist的id，创建后可看地址
- filename: gist的name(desc)
- port: 端口[可选]


## 打包

```bash
npm run build
```


## 启动
```bash
npm start
# node app.js
```


## API

*待编辑*


## TODO

1. - [ ] 配置导出、导入