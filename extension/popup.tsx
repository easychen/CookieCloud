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
  let init: Object={"endpoint":"http://127.0.0.1:8088","password":"123","interval":10,"domains":".jd.com","uuid":String(short_uid.generate()),"type":"up"};
  const [data, setData] = useState(init);
  
  async function test()
  {
    // console.log("request,begin");
    const ret = await sendToBackground<RequestBody, ResponseBody>({name:"config",body:{payload:data}});
    console.log("ret888...",ret);
    if( ret && ret['message'] == 'done' )
    {
      alert('测试成功');
    }else
    {
      alert('测试失败，请检查填写的信息是否正确');
    }
  }

  async function save()
  {
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

  useEffect(() => {
    async function load_config()
    {
      const ret = await load_data("COOKIE_SYNC_SETTING") ;
      if( ret )  setData({...data,...ret});
    }
    load_config();
  },[]);
  
  return <ThemeProvider><div className="w-128" style={{"width":"300px"}}>
    <div className="form p-5">
      <div className="text-line text-gray-600">
        <div className="">工作模式</div>
        <div className="my-2">
        <Radio.Group onChange={e=>onChange('type',e)} value={data['type']}>
          <Radio value={'up'}>上传到服务器</Radio>
          <Radio value={'down'}>覆盖到浏览器</Radio>
        </Radio.Group>
        </div>

        {data['type'] && data['type'] == 'down' && <div className="bg-red-600 text-white p-2 my-2 rounded">
        覆盖模式主要用于云端和只读用的浏览器，Cookie覆盖可能导致当前浏览器的登录和修改操作失效；另外部分网站不允许同一个cookie在多个浏览器同时登录，可能导致其他浏览器上账号退出。
        </div>}
        
        
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
        <input type="text" className="border-1  my-2 p-2 rounded w-full" placeholder="丢失后数据失效，请妥善保管" value={data['password']}  onChange={e=>onChange('password',e)}/>
        <div className="">同步时间间隔·分钟</div>
        <input type="number" className="border-1  my-2 p-2 rounded w-full" placeholder="最少10分钟" value={data['interval']} onChange={e=>onChange('interval',e)} />
        <div className="">同步域名</div>
        <textarea className="border-1  my-2 p-2 rounded w-full" style={{"height":"120px"}} placeholder="一行一个，支持.domain子域名匹配，留空默认同步全部"  onChange={e=>onChange('domains',e)} value={data['domains']}/>
        <div className="flex flex-row justify-between mt-2">
          <div className="left text-gray-400">
            <Button className="hover:bg-blue-100" onClick={()=>test()}>测试</Button>
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
