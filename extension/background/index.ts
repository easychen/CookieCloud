import "@plasmohq/messaging/background";
import { upload_cookie, download_cookie, load_data, save_data } from '../function';

export const life = 42
console.log(`HELLO WORLD - ${life}`)

chrome.runtime.onInstalled.addListener(function (details)
{
    if (details.reason == "install")
    {
        chrome.alarms.create('bg_cookie_sync', 
        {
            when: Date.now(),
            periodInMinutes: 1
        });
    }
    else if (details.reason == "update")
    {
        chrome.alarms.create('bg_cookie_sync', 
        {
            when: Date.now(),
            periodInMinutes: 1
        });
    }
});



chrome.alarms.onAlarm.addListener( async a =>
{
    if( a.name == 'bg_cookie_sync' )
    {
        // console.log( 'bg_cookie_sync' );
        const config = await load_data("COOKIE_SYNC_SETTING") ;
        if( config && config.uuid )
        {
            // 获得当前的分钟数
            const now = new Date();
            const minute = now.getMinutes();
            const hour = now.getHours();
            const day = now.getDate();
            const minute_count = ( day*24 + hour)*60 + minute;

            // 如果时间间隔可以整除分钟数，则进行同步
            if( parseInt(config.interval) < 1 || minute_count % config.interval == 0 )
            {
                // 开始同步
                console.log(`同步时间到 ${minute_count} ${config.interval}`);
                if(config.type && config.type == 'down')
                {
                    // 从服务器取得cookie，向本地写入cookie
                    const result = await download_cookie(config);
                    if( result && result['action'] == 'done' ) 
                        console.log("下载覆盖成功");
                    else
                        console.log( result );
                }else
                {
                    
                    const result = await upload_cookie(config);
                    if( result && result['action'] == 'done' ) 
                        console.log("上传成功");
                    else
                        console.log( result );
                }
            }else
            {
                // console.log(`未到同步时间 ${minute_count} ${config.interval}`);
            }
            
            
            
            
        }


    }    
});
