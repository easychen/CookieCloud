import "@plasmohq/messaging/background";
import { upload_cookie, download_cookie, load_data, save_data, sleep } from '../function';

export const life = 42
console.log(`HELLO WORLD - ${life}`)

chrome.runtime.onInstalled.addListener(function (details)
{
    if (details.reason == "install")
    {
        chrome.alarms.create('bg_1_minute', 
        {
            when: Date.now(),
            periodInMinutes: 1
        });
    }
    else if (details.reason == "update")
    {
        chrome.alarms.create('bg_1_minute', 
        {
            when: Date.now(),
            periodInMinutes: 1
        });
    }
});



chrome.alarms.onAlarm.addListener( async a =>
{
    if( a.name == 'bg_1_minute' )
    {
        // console.log( 'bg_1_minute' );
        const config = await load_data("COOKIE_SYNC_SETTING") ;
        if( config )
        {
            // 获得当前的分钟数
            const now = new Date();
            const minute = now.getMinutes();
            const hour = now.getHours();
            const day = now.getDate();
            const minute_count = ( day*24 + hour)*60 + minute;

            if( config.uuid )
            {
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

            if( config.keep_live )
            {
                // 按行分割，每行的格式为 url|interval
                const keep_live = config.keep_live?.trim()?.split("\n");
                for( let i=0; i<keep_live.length; i++ )
                {
                    const line = keep_live[i];
                    const parts = line.split("|");
                    const url = parts[0];
                    const interval = parts[1]?parseInt(parts[1]):60;
                    if( interval > 0 && minute_count % interval == 0 )
                    {
                        // 开始访问
                        console.log(`keep live ${url} ${minute_count} ${interval}`);
                        // chrome tab create 
                        const tab = await chrome.tabs.create({"url":url,"active":false,"pinned":true});
                        // 等待五秒后关闭
                        await sleep(5000);
                        await chrome.tabs.remove(tab.id);
                    }
                }
            }
            
            
            
            
            
            
        }


    }    
});