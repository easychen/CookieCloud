import type { PlasmoMessaging } from "@plasmohq/messaging"
import { upload_cookie, download_cookie } from '../../function';
// import { Base64 } from 'js-base64';

export type RequestBody = {
    payload: object
}

export type ResponseBody = {
    message: string,
    note: string|null,
}
 
export const handler: PlasmoMessaging.MessageHandler<RequestBody,
ResponseBody> = async (req, res) => {
    // 获得cookie，并进行过滤
    const payload = req.body.payload;
    const result = (payload['type'] && payload['type'] == 'down') ?  await download_cookie(payload) : await upload_cookie(payload);
    res.send({
        message: result['action'],
        note: result['note'],
    })   
}

