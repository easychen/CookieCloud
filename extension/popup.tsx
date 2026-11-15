import { useState, useEffect } from "react"
import { sendToBackground } from "@plasmohq/messaging"
import type { RequestBody, ResponseBody } from "~background/messages/config"
import short_uid from 'short-uuid';
import "./style.scss"
import { load_config, save_config } from './function';
import browser from 'webextension-polyfill';

function IndexPopup({ inTab = false }: { inTab?: boolean }) {
  let init: Object={"endpoint":"http://127.0.0.1:8088","password":"","interval":10,"domains":"","uuid":String(short_uid.generate()),"type":"up","keep_live":"","with_storage":1,"blacklist":"google.com", "headers": "","expire_minutes":60*24*365,"storage_type":"http","s3_bucket":"","s3_region":"us-east-1","s3_endpoint":"","s3_access_key":"","s3_secret_key":"","s3_session_token":"","s3_path_prefix":"cookiecloud","s3_force_path_style":0,"webdav_endpoint":"","webdav_username":"","webdav_password":"","webdav_path":"cookiecloud"};
  const [data, setData] = useState(init);
  const is_in_tab = inTab || window.location.pathname.includes("options");

  function validate_config(config)
  {
    if( !config['password'] || !config['uuid'] || !config['type'] )
      return browser.i18n.getMessage("fullMessagePlease");
    const storage_type = config['storage_type'] || 'http';
    if( storage_type === 'http' && !config['endpoint'] )
      return browser.i18n.getMessage("fullMessagePlease");
    if( storage_type === 's3' && (!config['s3_bucket'] || !config['s3_access_key'] || !config['s3_secret_key'] ) )
      return browser.i18n.getMessage("s3ConfigMissing");
    if( storage_type === 'webdav' && !config['webdav_endpoint'] )
      return browser.i18n.getMessage("webdavConfigMissing");
    return null;
  }
  
  async function test(action=browser.i18n.getMessage('test'))
  {
    console.log("request,begin");
    const err = validate_config(data);
    if( err ){ alert(err); return; }
    if( data['type'] == 'pause' )
    {
      // alert('暂停状态不能'+action);
      alert(browser.i18n.getMessage("actionNotAllowedInPause"));
      return;
    }
    const ret = await sendToBackground<RequestBody, ResponseBody>({name:"config",body:{payload:{...data,no_cache:1}}});
    console.log(action+"返回",ret);
    if( ret && ret['message'] == 'done' )
    {
      if( ret['note'] ) 
      {
        alert(ret['note']);
      }
      else
        alert(action+browser.i18n.getMessage('success'));
    }else
    {
      alert(action+browser.i18n.getMessage('failedCheckInfo'));
    }
  }

  async function save()
  {
    const err = validate_config(data);
    if( err ){ alert(err); return; }
    await save_config( data );
    const ret = await load_config() ;
    console.log( "load", ret );
    if( JSON.stringify(ret) == JSON.stringify(data) )
    {
      // alert('保存成功');
      alert(browser.i18n.getMessage("saveSuccess"));
      if( !is_in_tab ) window.close();
    }
  }

  async function open_in_tab()
  {
    try {
      if( browser?.runtime?.openOptionsPage )
        await browser.runtime.openOptionsPage();
      else
        await browser.tabs.create({url: chrome.runtime.getURL("options.html")});
    } catch (error) {
      await browser.tabs.create({url: chrome.runtime.getURL("options.html")});
    }
  }

  function onChange(name:string, e:(React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>))
  {
    // console.log( "e" , name , e.target.value );
    setData({...data,[name]:e.target.value??''});
  }

  function uuid_regen()
  {
    setData({...data,'uuid':String(short_uid.generate())});
  }

  function password_gen()
  {
    setData({...data,'password':String(short_uid.generate())});
  }

  useEffect(() => {
    async function load_config_data()
    {
      const ret = await load_config() ;
      if( ret )  setData({...data,...ret});
    }
    load_config_data();
  },[]);
  
  return <div className="w-128 overflow-x-hidden" style={{"width":is_in_tab ? "100%" : "360px"}}>
    <div className="form p-5">
      <div className="text-line text-gray-600">
        {!is_in_tab && <div className="flex flex-row justify-end">
          <button className="p-2 rounded hover:bg-blue-100 text-sm" onClick={()=>open_in_tab()}>{browser.i18n.getMessage('openInTab')}</button>
        </div>}
        <div className="">{browser.i18n.getMessage('workingMode')}</div>
        <div className="my-2">
        {/*
        <Radio.Group onChange={e=>onChange('type',e)} value={data['type']}>
          <Radio value={'up'}>上传到服务器</Radio>
          <Radio value={'down'}>覆盖到浏览器</Radio>
          <Radio value={'pause'}>暂停</Radio>
        </Radio.Group>
        */}
        <label className="mr-2"><input type="radio" name="type" value="up" checked={data['type'] == 'up'} onChange={e=>onChange('type',e)} /> {browser.i18n.getMessage('upToServer')}</label>
        <label className="mr-2"><input type="radio" name="type" value="down" checked={data['type'] == 'down'} onChange={e=>onChange('type',e)} /> {browser.i18n.getMessage('overwriteToBrowser')}
        </label>
        <label className="mr-2"><input type="radio" name="type" value="pause" checked={data['type'] == 'pause'} onChange={e=>onChange('type',e)} /> {browser.i18n.getMessage('pauseSync')}</label>
        
        </div>

        {data['type'] && data['type'] == 'down' && <div className="bg-red-600 text-white p-2 my-2 rounded">
        {browser.i18n.getMessage('overwriteModeDesp')}
        </div>}
        
        {data['type'] && data['type'] != 'pause' && <>
        <div className="">{browser.i18n.getMessage('storageType')}</div>
        <select className="border-1 my-2 p-2 rounded w-full" value={data['storage_type']||'http'} onChange={e=>onChange('storage_type',e)}>
          <option value="http">{browser.i18n.getMessage('storageTypeServer')}</option>
          <option value="s3">{browser.i18n.getMessage('storageTypeS3')}</option>
          <option value="webdav">{browser.i18n.getMessage('storageTypeWebDAV')}</option>
        </select>

        {data['storage_type'] == 'http' && <>
        <div className="">{browser.i18n.getMessage('serverHost')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('serverHostPlaceholder')} value={data['endpoint']} onChange={e=>onChange('endpoint',e)} />
        </>}

        {data['storage_type'] == 's3' && <>
        <div className="">{browser.i18n.getMessage('s3Bucket')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3BucketPlaceholder')} value={data['s3_bucket']} onChange={e=>onChange('s3_bucket',e)} />
        <div className="">{browser.i18n.getMessage('s3Region')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3RegionPlaceholder')} value={data['s3_region']} onChange={e=>onChange('s3_region',e)} />
        <div className="">{browser.i18n.getMessage('s3Endpoint')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3EndpointPlaceholder')} value={data['s3_endpoint']} onChange={e=>onChange('s3_endpoint',e)} />
        <div className="">{browser.i18n.getMessage('s3AccessKey')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3AccessKeyPlaceholder')} value={data['s3_access_key']} onChange={e=>onChange('s3_access_key',e)} />
        <div className="">{browser.i18n.getMessage('s3SecretKey')}</div>
        <input type="password" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3SecretKeyPlaceholder')} value={data['s3_secret_key']} onChange={e=>onChange('s3_secret_key',e)} />
        <div className="">{browser.i18n.getMessage('s3SessionToken')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3SessionTokenPlaceholder')} value={data['s3_session_token']} onChange={e=>onChange('s3_session_token',e)} />
        <div className="">{browser.i18n.getMessage('s3PathPrefix')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('s3PathPrefixPlaceholder')} value={data['s3_path_prefix']} onChange={e=>onChange('s3_path_prefix',e)} />
        <div className="">{browser.i18n.getMessage('s3ForcePathStyle')}</div>
        <div className="my-2 flex flex-row items-center">
          <label className="mr-2"><input type="radio" name="s3_force_path_style" value="1" checked={data['s3_force_path_style'] == 1} onChange={e=>onChange('s3_force_path_style',e)} /> {browser.i18n.getMessage('yes')}</label>
          <label className="mr-2"><input type="radio" name="s3_force_path_style" value="0" checked={data['s3_force_path_style'] == 0} onChange={e=>onChange('s3_force_path_style',e)} /> {browser.i18n.getMessage('no')}</label>
        </div>
        </>}

        {data['storage_type'] == 'webdav' && <>
        <div className="">{browser.i18n.getMessage('webdavEndpoint')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('webdavEndpointPlaceholder')} value={data['webdav_endpoint']} onChange={e=>onChange('webdav_endpoint',e)} />
        <div className="">{browser.i18n.getMessage('webdavUsername')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('webdavUsernamePlaceholder')} value={data['webdav_username']} onChange={e=>onChange('webdav_username',e)} />
        <div className="">{browser.i18n.getMessage('webdavPassword')}</div>
        <input type="password" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('webdavPasswordPlaceholder')} value={data['webdav_password']} onChange={e=>onChange('webdav_password',e)} />
        <div className="">{browser.i18n.getMessage('webdavPath')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('webdavPathPlaceholder')} value={data['webdav_path']} onChange={e=>onChange('webdav_path',e)} />
        </>}
        <div className="">{browser.i18n.getMessage('uuid')}</div>
        <div className="flex flex-row">
          <div className="left flex-1">
          <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('uuidPlaceholder')} value={data['uuid']}  onChange={e=>onChange('uuid',e)}/>
          </div>
          <div className="right">
          <button className="p-2 rounded my-2 ml-2" onClick={()=>uuid_regen()}>{browser.i18n.getMessage('reGenerate')}</button>
          </div>
        </div>
        <div className="">{browser.i18n.getMessage('syncPassword')}</div>
        <div className="flex flex-row">
          <div className="left flex-1">
          <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('syncPasswordPlaceholder')} value={data['password']}  onChange={e=>onChange('password',e)}/>
          </div>
          <div className="right">
          <button className="p-2 rounded my-2 ml-2" onClick={()=>password_gen()}>{browser.i18n.getMessage('generate')}</button>
          </div>
        </div>
        <div className="">{browser.i18n.getMessage('cookieExpireMinutes')}</div>
        <input type="number" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('cookieExpireMinutesPlaceholder')} value={data['expire_minutes']||0} onChange={e=>onChange('expire_minutes',e)} />

        <div className="">{browser.i18n.getMessage('syncTimeInterval')}</div>
        <input type="number" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('syncTimeIntervalPlaceholder')} value={data['interval']} onChange={e=>onChange('interval',e)} />

        {data['type'] && data['type'] == 'up' && <>
        <div className="">{browser.i18n.getMessage('syncLocalStorageOrNot')}</div>
        <div className="my-2 flex flex-row items-center">
        {/*
        <Radio.Group onChange={e=>onChange('with_storage',e)} value={data['with_storage']}>
          <Radio value={1}>是</Radio>
          <Radio value={0}>否</Radio>
        </Radio.Group>
        */}
        <label className="mr-2"><input type="radio" name="with_storage" value="1" checked={data['with_storage'] == 1} onChange={e=>onChange('with_storage',e)} /> {browser.i18n.getMessage('yes')}</label>
        <label className="mr-2"><input type="radio" name="with_storage" value="0" checked={data['with_storage'] == 0} onChange={e=>onChange('with_storage',e)} /> {browser.i18n.getMessage('no')}</label>
        </div>

        {data['storage_type'] == 'http' && <>
        <div className="">{browser.i18n.getMessage('requestHeader')}</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder={browser.i18n.getMessage('requestHeaderPlaceholder')}  onChange={e=>onChange('headers',e)} value={data['headers']}/>
        </>}

        <div className="">{browser.i18n.getMessage('syncDomainKeyword')}</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder={browser.i18n.getMessage('syncDomainKeywordPlaceholder')}  onChange={e=>onChange('domains',e)} value={data['domains']}/>

        <div className="">{browser.i18n.getMessage('syncDomainBlacklist')}</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder={browser.i18n.getMessage('syncDomainBlacklistPlaceholder')}  onChange={e=>onChange('blacklist',e)} value={data['blacklist']}/>



        <div className="">{browser.i18n.getMessage('cookieKeepLive')}</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder={browser.i18n.getMessage('cookieKeepLivePlaceholder')}  onChange={e=>onChange('keep_live',e)} value={data['keep_live']}/>
        </>}
        </>}

        {data['type'] && data['type'] == 'pause' && <>
        <div className="bg-blue-400 text-white p-2 my-2 rounded">{browser.i18n.getMessage('keepLiveStop')}</div>
        </>}
        <div className="flex flex-row justify-between mt-2">
          <div className="left text-gray-400">
            {data['type'] && data['type'] != 'pause' && <><button className="p-2 rounded hover:bg-blue-100 mr-2" onClick={()=>test(browser.i18n.getMessage('syncManual'))}>{browser.i18n.getMessage('syncManual')}</button><button className="hover:bg-blue-100 p-2 rounded" onClick={()=>test(browser.i18n.getMessage('test'))}>{browser.i18n.getMessage('test')}</button></>}

          </div>
          <div className="right">
            <button className="p-2 rounded" onClick={()=>save()}>{browser.i18n.getMessage('save')}</button>
          </div>
        </div>

      </div>
    </div>
  </div>
}

export default IndexPopup
