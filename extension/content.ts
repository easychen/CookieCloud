export {}
import { load_data, save_data, remove_data, get_local_storage_by_domains } from './function';


window.addEventListener("load", async () => {
    
    // 获得当前域名
    const host = window.location.hostname;
    const config = await load_data("COOKIE_SYNC_SETTING") ;
    const domains = String(config?.domains||'').split("\n").map( line => line.trim() ).filter( line => line.length > 0 );
    if( domains.length > 0 )
    {
        const host_normalized = host.trim().toLowerCase().replace(/^\./, '');
        // 检查 domain 是否匹配 domains的每一个域名
        let matched = false;
        const strict_domain = Number(config?.strict_domain) === 1;
        for(const domain of domains)
        {
            const domain_normalized = String(domain).trim().toLowerCase().replace(/^\./, '');
            if( strict_domain )
            {
                if( host_normalized === domain_normalized ) matched = true;
            }else
            {
                if( host.includes(domain) ) matched = true;
            }
        }
        if( !matched ) return false;
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
