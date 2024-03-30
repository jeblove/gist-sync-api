const express = require('express');
const { Kevast } = require('kevast');
const { KevastFile } = require('kevast-file');
const { KevastGist } = require('kevast-gist');
const { KevastEncrypt } = require('kevast-encrypt');
const he = require('he');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
require('dotenv').config();

const app = express();
const port = process.env.port || 3201;

const requiredEnvVariables = ['token', 'password', 'gistid', 'filename'];
let missingEnvVariables = requiredEnvVariables.filter((variable) => !process.env[variable]);
if (missingEnvVariables.length > 0) {
  console.info("无.env环境变量，使用请求参数方式")
}

const keys = {
  DOMAIN_LIST_KEY: '__DOMAIN_LIST__'
}

// 本地存储加密ck
const local_store_file = 'domain_gists.json'

/**
 * Kevast实例化
 * @param {string} token github_gist_token
 * @param {string} password 加密密码
 * @param {string} gistid gist的id
 * @param {string} filename gist文件名
 * @returns kevast_store
 */
async function getFreshKevastInstance(token, password, gistid, filename) {
  let fileStore = new KevastFile(local_store_file);
  let kevast_store = new Kevast(fileStore);

  // 检测参数
  if (!token || !gistid || !filename) {
    console.info('无token, gistid, filename参数，本地调用')
    let filePath = path.join(__dirname, local_store_file)
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`请求失败，本地文件${local_store_file}不存在`);
      }
    });
  } else {
    console.info('有token, gistid, filename参数，gist服务调用')
    kevast_store.add(new KevastGist(token, gistid, filename));
  }
  if (!password) {
    console.error('缺少必要的参数: password');
  }
  kevast_store.use(new KevastEncrypt(password));
  return kevast_store;
}

/**
 * 路由中间件
 */
app.use(async (req, res, next) => {
  try {
    let token = req.headers['token'] || process.env.token;
    let password = req.headers['password'] || process.env.password;
    let gistid = req.headers['gistid'] || process.env.gistid;
    let filename = req.headers['filename'] || process.env.filename;

    req.kevast_store = await getFreshKevastInstance(token, password, gistid, filename);
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * 获取指定域名的cookie
 * @param {string} domain 域名
 * @param {object} kevast_store req.kevast_store
 * @returns cookie，例如
[
    {
        "name": "session_id",
        "value": "12345",
        "path": "/",
        "expires": "2024-01-01T00:00:00.000Z",
        "secure": true,
        "httpOnly": false,
        "sameSite": "lax"
    },
    {
        "name": "user_preference",
        "value": "dark_mode",
        "path": "/",
        "expires": "2024-12-31T00:00:00.000Z",
        "secure": false,
        "httpOnly": true,
        "sameSite": "strict"
    }
]
 */
async function get_cookie(domain, kevast_store) {
  const cookie = await kevast_store.get(domain);

  return cookie;
}

/**
* 获取域名列表
* @param {object} kevast_store req.kevast_store
* @returns 当前域名列表
*/
async function get_domain_list(kevast_store) {
  const value = await kevast_store.get(keys.DOMAIN_LIST_KEY);
  return value;
}

/**
* 设置站点cookie
* @param {list} cookiesList cookie列表
* @param {object} kevast_store req.kevast_store
[
  {
      domain: "test.com",
      cookies: [
          {
              name: 'session_id',
              value: '12345',
              path: '/',
          },
          {
              name: 'user_preference',
              value: 'dark_mode',
              sameSite: 'strict'
          }
      ]
  }
]
* @param {list} domainList 域名列表[可选]
* [ 'a.com', 'b.com', 'test.com' ]
* @returns 更新后的域名列表
*/
async function set_cookie(cookiesList, domainList, kevast_store) {
  const bulk = [];
  let currentDomainList = domainList || (await kevast_store.get(keys.DOMAIN_LIST_KEY)) || [];
  newDomainList = JSON.parse(currentDomainList);

  for (const { domain, cookies } of cookiesList) {
    const isinclude = newDomainList.some(value => value.includes(domain));
    if (!isinclude) {
      newDomainList.push(domain)
    }
    bulk.push({ key: domain, value: JSON.stringify(cookies) });
  }
  // 域名列表更新
  bulk.push({ key: keys.DOMAIN_LIST_KEY, value: JSON.stringify(newDomainList) });

  await kevast_store.bulkSet(bulk);
  return newDomainList
}

/**
* 删除指定域名cookie
* @param {string} domain 删除的域名
* @param {object} kevast_store req.kevast_store
* @param {list} domainList 域名列表[可选]
* @returns 删除后的域名列表
*/
async function remove(domain, kevast_store, domainList) {
  let currentDomainList = domainList || (await kevast_store.get(keys.DOMAIN_LIST_KEY)) || [];
  // 去除目标域名
  const newDomainList = JSON.parse(currentDomainList).filter((d) => d !== domain);

  const bulk = [
    { key: keys.DOMAIN_LIST_KEY, value: JSON.stringify(newDomainList) },
    { key: domain, value: undefined },
  ]

  await kevast_store.bulkSet(bulk);
  return newDomainList;
}

/**
 * 获取所有cookie
 * @param {object} kevast_store req.kevast_store
 * @returns cookies
 */
async function get_all_cookie(kevast_store) {
  let _domain_list = await get_domain_list(kevast_store);
  _domain_list = JSON.parse(_domain_list);

  const cookie_object = {};
  
  await Promise.all(_domain_list.map(async (domain) => {
    const ck = await get_cookie(domain, kevast_store);
    cookie_object[domain] = JSON.parse(ck);
  }));
  
  await writeFileAsync('ck.json', JSON.stringify(cookie_object, null, 2));
  return cookie_object;
}

app.get('/api/get_all_cookie', async (req, res) => {
  try {
    const result = await get_all_cookie(req.kevast_store);
    res.json(result)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
})

app.get('/api/get_cookie/:domain', async (req, res) => {
  try {
    const value = await get_cookie(domain = req.params.domain, kevast_store = req.kevast_store);
    const json_data = JSON.parse(he.decode(value));
    res.json(json_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/get_domain_list', async (req, res) => {
  try {
    const value = await get_domain_list(req.kevast_store);
    const json_data = JSON.parse(he.decode(value));
    res.json(json_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// http api 接口未测试
app.get('/api/set_cookie/:cookies_list', async (req, res) => {
  try {
    const value = await set_cookie(req.params.cookies_list, req.kevast_store);
    const json_data = JSON.parse(he.decode(value));
    res.json(json_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/remove_cookie/:domain', async (req, res) => {
  try {
    const value = await remove(req.params.domain, req.kevast_store);
    res.json(value);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});