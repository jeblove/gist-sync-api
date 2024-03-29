const express = require('express');
const { Kevast } = require('kevast');
const { KevastFile } = require('kevast-file');
const { KevastGist } = require('kevast-gist');
const { KevastEncrypt } = require('kevast-encrypt');
const he = require('he');
// const { readFileSync } = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.port || 3201;

const requiredEnvVariables = ['token', 'password', 'gistId', 'filename'];
const missingEnvVariables = requiredEnvVariables.filter((variable) => !process.env[variable]);
if (missingEnvVariables.length > 0) {
  console.error('缺少以下必要环境变量：', missingEnvVariables.join(', '));
  console.info("请在同一目录下创建.env文件，编写'token', 'password', 'gistId', 'filename'环境变量");
  process.exit(1);
}

const token = process.env.token;
const password = process.env.password;
const gistId = process.env.gistId;
const filename = process.env.filename;
const keys = {
  DOMAIN_LIST_KEY: '__DOMAIN_LIST__'
}

/**
 * Kevast实例化
 * @returns kevast_store
 */
async function getFreshKevastInstance() {
  const fileStore = new KevastFile('./domain_gists.json');
  const kevast_store = new Kevast(fileStore);

  kevast_store.add(new KevastGist(token, gistId, filename));
  kevast_store.use(new KevastEncrypt(password));
  return kevast_store;
}

/**
 * 路由中间件
 */
app.use(async (req, res, next) => {
  try {
    req.kevast_store = await getFreshKevastInstance();
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


app.get('/api/get_cookie/:domain', async (req, res) => {
  try {
    const value = await get_cookie(domain=req.params.domain, kevast_store=req.kevast_store);
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
  getFreshKevastInstance()
  console.log(`Server running at http://localhost:${port}`);
});