export type PropertyData={title:string;address:string;city:string;price:string;beds:string;baths:string;area:string;description:string;photos:string[];agent:string;email:string;phone:string;brokerage:string;accent:string};
export type PropertyRecord={id?:string;published:boolean;payload:PropertyData};
export const emptyProperty:PropertyData={title:'',address:'',city:'',price:'',beds:'',baths:'',area:'',description:'',photos:[],agent:'',email:'',phone:'',brokerage:'',accent:'#235e49'};
export function propertyLink(id:string){return `${location.origin}${process.env.NEXT_PUBLIC_BASE_PATH||''}/property/?id=${encodeURIComponent(id)}`;}
export function safePhoto(s:string){return /^https:\/\//i.test(s)||/^data:image\/(jpeg|png|webp);base64,/i.test(s)?s:'';}
