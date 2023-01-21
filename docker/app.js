const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const cors = require('cors');
app.use(cors());

const data_dir = path.join(__dirname, 'data');
// make dir if not exist
if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir);

var multer = require('multer');
var forms = multer({limits: { fieldSize: 100*1024*1024 }});
app.use(forms.array()); 

const bodyParser = require('body-parser')
app.use(bodyParser.json({limit : '50mb' }));  
app.use(bodyParser.urlencoded({ extended: true }));

const api_root = process.env.API_ROOT ? process.env.API_ROOT.trim().replace(/\/+$/, '') : '';
// console.log(api_root, process.env);

app.all(`${api_root}/`, (req, res) => {
    res.send('Hello World!'+`API ROOT = ${api_root}`);
});

app.post(`${api_root}/update`, (req, res) => {
    const { encrypted, uuid } = req.body;
    // none of the fields can be empty
    if (!encrypted || !uuid) {
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
});

app.all(`${api_root}/get/:uuid`, (req, res) => {
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
});


app.use(function (err, req, res, next) {
    console.error(err);
    res.status(500).send('Internal Serverless Error');
});


const port = 8088;
app.listen(port, () => {
    console.log(`Server start on http://localhost:${port}${api_root}`);
});

function cookie_decrypt( uuid, encrypted, password )
{
    const CryptoJS = require('crypto-js');
    const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
    const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
}
  