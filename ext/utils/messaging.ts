import { upload_cookie, download_cookie } from './functions';

export interface RequestBody {
  payload: any;
}

export interface ResponseBody {
  message: string;
  note: string | null;
}

export async function handleConfigMessage(payload: any): Promise<ResponseBody> {
  const result = (payload.type && payload.type == 'down') ? 
    await download_cookie(payload) : 
    await upload_cookie(payload);
  
  const action = typeof result?.action === 'string' && result.action ? result.action : 'error';
  const note = (typeof result?.note === 'string' && result.note)
    ? result.note
    : (typeof result?.message === 'string' && result.message ? result.message : null);

  return {
    message: action,
    note,
  };
}
