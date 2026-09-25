/** Narrow social replies only; never intercept a factual or operational request. */
export function conversationGreeting(text:string,now:string,timeZone?:string):string|null {
 const value=text.trim().replace(/[’]/g,"'").replace(/[.!?]+$/,'').trim();
 if(!/^(?:(?:hello|hi|hey|good morning|good afternoon|good evening)(?:[, ]+mallow)?(?:[,! .]+(?:how are you|how's your day|how is your day)(?: going)?)?|how are you(?:[, ]+mallow)?)$/i.test(value))return null;
 const date=new Date(now);if(!Number.isFinite(date.getTime()))return "Hello! It's good to hear from you. How is your day going?";
 try{const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone,hour:'numeric',hourCycle:'h23'}).format(date));
  if(hour>=5&&hour<12)return 'Good morning! How is your morning going?';
  if(hour>=12&&hour<17)return 'Good afternoon! How is your day going?';
  if(hour>=17&&hour<23)return 'Good evening! How has your day been?';
  return "Hello! It's good to hear from you. How is your night going?";
 }catch{return "Hello! It's good to hear from you. How is your day going?";}
}
