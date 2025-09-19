import { useState, useEffect } from "react"
import { sendToBackground } from "@plasmohq/messaging"
import type { RequestBody, ResponseBody } from "~background/messages/config"
import short_uid from 'short-uuid';
import "./style.scss"
import { load_data, save_data } from './function';
import browser from 'webextension-polyfill';

function IndexPopup() {
  let init: Object={"endpoint":"http://127.0.0.1:8088","password":"","interval":10,"domains":"","uuid":String(short_uid.generate()),"type":"up","keep_live":"",
    "with_storage":1,"storage_domains":"", "blacklist":"google.com", "headers": "","expire_minutes":60*24*365};
  const [data, setData] = useState(init);
  
  async function test(action=browser.i18n.getMessage('test'))
  {
    console.log("request,begin");
    if( !data['endpoint'] || !data['password'] || !data['uuid'] || !data['type'] )
    {
      alert(browser.i18n.getMessage("fullMessagePlease"));
      return;
    }
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
        alert(ret['note']);
      else
        alert(action+browser.i18n.getMessage('success'));
    }else
    {
      alert(action+browser.i18n.getMessage('failedCheckInfo'));
    }
  }

  async function save()
  {
    if( !data['endpoint'] || !data['password'] || !data['uuid'] || !data['type'] )
    {
      // alert('请填写完整的信息');
      alert(browser.i18n.getMessage("fullMessagePlease"));
      return;
    }
    await save_data( "COOKIE_SYNC_SETTING", data );
    const ret = await load_data("COOKIE_SYNC_SETTING") ;
    console.log( "load", ret );
    if( JSON.stringify(ret) == JSON.stringify(data) )
    {
      // alert('保存成功');
      alert(browser.i18n.getMessage("saveSuccess"));
      window.close();
    }
  }

  function onChange(name:string, e:(React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>))
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
    async function load_config()
    {
      const ret = await load_data("COOKIE_SYNC_SETTING") ;
      if( ret )  setData({...data,...ret});
    }
    load_config();
  },[]);
  
  return <div className="w-128 overflow-x-hidden" style={{"width":"360px"}}>
    <div className="form p-5">
      <div className="text-line text-gray-600">
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
        <div className="">{browser.i18n.getMessage('serverHost')}</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder={browser.i18n.getMessage('serverHostPlaceholder')} value={data['endpoint']} onChange={e=>onChange('endpoint',e)} />
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

        <div className="">{browser.i18n.getMessage('syncStorageDomainKeyword')}</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder={browser.i18n.getMessage('syncDomainKeywordPlaceholder')}  onChange={e=>onChange('storage_domains',e)} value={data['storage_domains']}/>

        <div className="">{browser.i18n.getMessage('requestHeader')}</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder={browser.i18n.getMessage('requestHeaderPlaceholder')}  onChange={e=>onChange('headers',e)} value={data['headers']}/>

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
