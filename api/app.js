const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const app = express();

const cors = require('cors');
app.use(cors());

const data_dir = path.join(__dirname, 'data');
// make dir if not exist
if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir);

var multer = require('multer');
var forms = multer({limits: { fieldSize: 100*1024*1024 }});
app.use(forms.array()); 

// add compression
const compression = require('compression');
app.use(compression());

const bodyParser = require('body-parser')
app.use(bodyParser.json({limit : '50mb' }));  
app.use(bodyParser.urlencoded({ extended: true }));

// add rate limit
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const api_root = process.env.API_ROOT ? process.env.API_ROOT.trim().replace(/\/+$/, '') : '';
// console.log(api_root, process.env);

// add health check
app.get(`${api_root}/health`, (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.all(`${api_root}/`, (req, res) => {
    res.send('Hello World!'+`API ROOT = ${api_root}`);
});

app.post(`${api_root}/update`, (req, res) => {
    try {
        const { encrypted, uuid } = req.body;
        // none of the fields can be empty
        if (!encrypted || !uuid) {
            logger.warn('Bad Request: Missing required fields');
            res.status(400).send('Bad Request');
            return;
        }

        // save encrypted to uuid file
        const file_path = path.join(data_dir, path.basename(uuid)+'.json');
        const content = JSON.stringify({"encrypted":encrypted});
        fs.writeFileSync(file_path, content);
        if( fs.readFileSync(file_path) == content )
            res.json({"action":"done"});
        else
            res.json({"action":"error"});
    } catch (error) {
        logger.error('update error:', error);
        res.status(500).send('Internal Serverless Error');
    }
});

app.all(`${api_root}/get/:uuid`, (req, res) => {
    try {
        const { uuid } = req.params;
        // none of the fields can be empty
        if (!uuid) {
            res.status(400).send('Bad Request');
            return;
        }
        // get encrypted from uuid file
        const file_path = path.join(data_dir, path.basename(uuid)+'.json');
        if (!fs.existsSync(file_path)) {
            res.status(404).send('Not Found');
            return;
        }
        const data = JSON.parse(fs.readFileSync(file_path));
        if( !data )
        {
            res.status(500).send('Internal Serverless Error');
            return;
        }
        else
        {
            // 如果传递了password，则返回解密后的数据
            if( req.body.password )
            {
                const parsed = cookie_decrypt( uuid, data.encrypted, req.body.password );
                res.json(parsed);
            }else
            {
                res.json(data);
            }
        }
    } catch (error) {
        logger.error('get error:', error);
        res.status(500).send('Internal Serverless Error');
    }
});

// 404 handler
app.use((req, res) => {
    logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Not Found',
        message: `The requested URL ${req.originalUrl} was not found on this server.`,
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// error handler
app.use(function (err, req, res, next) {
    logger.error('Unhandled Error:', err);
    res.status(500).send('Internal Serverless Error');
});

// graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM signal received.');

    // close http server
    server.close(() => {
        logger.info('HTTP server closed.');
    });

    // close cache
    await cache.close();

    // wait for log write
    setTimeout(() => {
        logger.info('Process terminated');
        process.exit(0);
    }, 1000);
});

const port = process.env.PORT || 8088;
app.listen(port, () => {
    logger.info(`Server start on http://localhost:${port}${api_root}`);
});

function cookie_decrypt( uuid, encrypted, password )
{
    const CryptoJS = require('crypto-js');
    const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
    const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
}
  