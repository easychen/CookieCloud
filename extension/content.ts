export {}
import { load_data, save_data, remove_data, get_local_storage_by_domains } from './function';


window.addEventListener("load", async () => {
    
    // 获得当前域名
    const host = window.location.hostname;
    const config = await load_data("COOKIE_SYNC_SETTING") ;
    if( config?.domains )
    {
        const domains = config.domains?.trim().split("\n");
        // 检查 domain 是否部分匹配 domains的每一个域名
        let matched = false;
        for(const domain of domains)
        {
            if( host.includes(domain) ) matched = true;
        }
        if( domains.length > 0 && !matched ) return false;
    }

    if( config?.type && config.type == 'down' )
    {
        const the_data = await load_data("LS-"+host);
        // console.log( "the_data", the_data );
        if( the_data )
        {
            // 覆盖本地的localStorage
            for( const key in the_data )
            {
                localStorage.setItem(key,the_data[key]);
            }
            // 清空浏览器的storage，避免多次覆盖
            await remove_data("LS-"+host);
        }
    }else
    {
        // 获得当前页面全部的localStorage
        const all = localStorage;
        const keys = Object.keys(all);
        const values = Object.values(all);
        const result = {};
        for( let i = 0; i < keys.length; i++ )
        {
            result[keys[i]] = values[i];
        }
        // 将其存储到浏览器的storage中
        if( Object.keys(result).length > 0  )
        {
            await save_data("LS-"+host,result);
            console.log("save to storage",host, result);  
            // console.log( (await get_local_storage_by_domains(['tqq'])));  
        }
    }
    
    
    
})