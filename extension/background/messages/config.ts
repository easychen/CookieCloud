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
    try {
        // 获得cookie，并进行过滤
        const payload = req.body.payload;
        const result = (payload['type'] && payload['type'] == 'down') ?  await download_cookie(payload) : await upload_cookie(payload);
        
        // 确保在函数结束前完成响应发送
        res.send({
            message: result && result['action'] ? result['action'] : 'error',
            note: result && result['note'] ? result['note'] : null,
        });
    } catch (error) {
        console.error("处理消息时出错:", error);
        // 确保即使出错也能发送响应
        res.send({
            message: 'error',
            note: `操作失败: ${error.message}`,
        });
    }
}

