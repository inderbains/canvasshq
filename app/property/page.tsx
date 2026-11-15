'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '../../lib/supabase';
import {type PropertyData} from '../../lib/properties';
import PropertyView from '../property-view';
export default function PublicProperty(){const [property,setProperty]=useState<PropertyData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;async function load(){const id=new URLSearchParams(location.search).get('id');const db=getSupabase();if(!id||!db){if(active){setError('This property page is unavailable.');setLoading(false)}return}const {data,error}=await db.from('property_pages').select('payload').eq('id',id).eq('published',true).maybeSingle();if(!active)return;if(error||!data)setError('This property page is unavailable or no longer published.');else{setProperty(data.payload as PropertyData);document.title=data.payload.title+' | Property showcase';}setLoading(false)}void load();return()=>{active=false}},[]);
 if(loading)return <div className="auth"><p>Opening property…</p></div>;
 if(error||!property)return <div className="auth"><section className="panel"><h1>Property unavailable</h1><p>{error}</p></section></div>;
 return <PropertyView property={property}/>;
}
