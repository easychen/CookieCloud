import { useState, useEffect } from "react"
import { sendToBackground } from "@plasmohq/messaging"
import type { RequestBody, ResponseBody } from "~background/messages/config"
import short_uid from 'short-uuid';
import "./style.scss"
import { load_data, save_data } from './function';
import { Button } from "antd";
import { ThemeProvider } from "~theme";
import type { RadioChangeEvent } from 'antd';
import { Radio } from 'antd';

function IndexPopup() {
  let init: Object={"endpoint":"http://127.0.0.1:8088","password":"","interval":10,"domains":"","uuid":String(short_uid.generate()),"type":"up","keep_live":"","with_storage":1,"blacklist":"google.com", "headers": ""};
  const [data, setData] = useState(init);
  
  async function test(action='测试')
  {
    console.log("request,begin");
    if( !data['endpoint'] || !data['password'] || !data['uuid'] || !data['type'] )
    {
      alert('请填写完整的信息');
      return;
    }
    if( data['type'] == 'pause' )
    {
      alert('暂停状态不能'+action);
      return;
    }
    const ret = await sendToBackground<RequestBody, ResponseBody>({name:"config",body:{payload:{...data,no_cache:1}}});
    console.log(action+"返回",ret);
    if( ret && ret['message'] == 'done' )
    {
      if( ret['note'] ) 
        alert(ret['note']);
      else
        alert(action+'成功');
    }else
    {
      alert(action+'失败，请检查填写的信息是否正确');
    }
  }

  async function save()
  {
    if( !data['endpoint'] || !data['password'] || !data['uuid'] || !data['type'] )
    {
      alert('请填写完整的信息');
      return;
    }
    await save_data( "COOKIE_SYNC_SETTING", data );
    const ret = await load_data("COOKIE_SYNC_SETTING") ;
    console.log( "load", ret );
    if( JSON.stringify(ret) == JSON.stringify(data) )
    {
      alert('保存成功');
      window.close();
    }
  }

  function onChange(name:string, e:(React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>|RadioChangeEvent))
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
  
  return <ThemeProvider><div className="w-128 overflow-x-hidden" style={{"width":"360px"}}>
    <div className="form p-5">
      <div className="text-line text-gray-600">
        <div className="">工作模式</div>
        <div className="my-2">
        <Radio.Group onChange={e=>onChange('type',e)} value={data['type']}>
          <Radio value={'up'}>上传到服务器</Radio>
          <Radio value={'down'}>覆盖到浏览器</Radio>
          <Radio value={'pause'}>暂停</Radio>
        </Radio.Group>
        </div>

        {data['type'] && data['type'] == 'down' && <div className="bg-red-600 text-white p-2 my-2 rounded">
        覆盖模式主要用于云端和只读用的浏览器，Cookie和Local Storage覆盖可能导致当前浏览器的登录和修改操作失效；另外部分网站不允许同一个cookie在多个浏览器同时登录，可能导致其他浏览器上账号退出。
        </div>}
        
        {data['type'] && data['type'] != 'pause' && <>
        <div className="">服务器地址</div>
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder="请输入服务器地址" value={data['endpoint']} onChange={e=>onChange('endpoint',e)} />
        <div className="">用户KEY</div>
        <div className="flex flex-row">
          <div className="left flex-1">
          <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder="唯一用户ID" value={data['uuid']}  onChange={e=>onChange('uuid',e)}/>
          </div>
          <div className="right">
          <button className="p-2 rounded my-2 ml-2" onClick={()=>uuid_regen()}>重新生成</button>
          </div>
        </div>
        <div className="">端对端加密密码</div>
        <div className="flex flex-row">
          <div className="left flex-1">
          <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder="丢失后数据失效，请妥善保管" value={data['password']}  onChange={e=>onChange('password',e)}/>
          </div>
          <div className="right">
          <button className="p-2 rounded my-2 ml-2" onClick={()=>password_gen()}>自动生成</button>
          </div>
        </div>
        <div className="">同步时间间隔·分钟</div>
        <input type="number" className="border-1  my-2 p-2 rounded w-full" placeholder="最少10分钟" value={data['interval']} onChange={e=>onChange('interval',e)} />

        {data['type'] && data['type'] == 'up' && <>
        <div className="">是否同步Local Storage</div>
        <div className="my-2">
        <Radio.Group onChange={e=>onChange('with_storage',e)} value={data['with_storage']}>
          <Radio value={1}>是</Radio>
          <Radio value={0}>否</Radio>
        </Radio.Group>
        </div>

        <div className="">请求Header·选填</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder="在请求时追加Header，用于服务端鉴权等场景，一行一个，格式为'Key:Value'，不能有空格"  onChange={e=>onChange('headers',e)} value={data['headers']}/>

        <div className="">同步域名关键词·选填</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder="一行一个，同步包含关键词的全部域名，如qq.com,jd.com会包含全部子域名，留空默认同步全部"  onChange={e=>onChange('domains',e)} value={data['domains']}/>

        <div className="">同步域名黑名单·选填</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder="黑名单仅在同步域名关键词为空时生效。一行一个域名，匹配则不参与同步"  onChange={e=>onChange('blacklist',e)} value={data['blacklist']}/>



        <div className="">Cookie保活·选填</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"60px"}} placeholder="定时后台刷新URL，模拟用户活跃。一行一个URL，默认60分钟，可用 URL|分钟数 的方式指定刷新时间"  onChange={e=>onChange('keep_live',e)} value={data['keep_live']}/>
        </>}
        </>}

        {data['type'] && data['type'] == 'pause' && <>
        <div className="bg-blue-400 text-white p-2 my-2 rounded">暂停同步和保活</div>
        </>}
        <div className="flex flex-row justify-between mt-2">
          <div className="left text-gray-400">
            {data['type'] && data['type'] != 'pause' && <><Button className="hover:bg-blue-100 mr-2" onClick={()=>test('手动同步')}>手动同步</Button><Button className="hover:bg-blue-100" onClick={()=>test('测试')}>测试</Button></>}

          </div>
          <div className="right">
            <Button className="" onClick={()=>save()}>保存</Button>
          </div>
        </div>

      </div>
    </div>
  </div></ThemeProvider>
}

export default IndexPopup
