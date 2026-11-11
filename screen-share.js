// Keep the published video track (and its SID) so viewers keep their selection.
export const screenCaptureOptions = {
  audio: true, resolution: {width:1280,height:720,frameRate:30}, contentHint:'motion',
};
export const displayConstraints = {
  video: {width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},
  audio: true, surfaceSwitching:'include', selfBrowserSurface:'exclude',
};
export async function switchScreen(participant, {
  capture = () => navigator.mediaDevices.getDisplayMedia(displayConstraints),
  isActive = () => true,
} = {}) {
  const publication=participant.getTrackPublication('screen_share');
  if(!publication?.track)throw new Error('Inicie uma transmissão antes de trocar a tela.');
  const video=publication.track, oldVideo=video.mediaStreamTrack;
  let stream;
  try{stream=await capture();}catch(error){
    if(error.name==='NotAllowedError'||error.name==='AbortError')return {cancelled:true};
    throw error;
  }
  const nextVideo=stream.getVideoTracks()[0],nextAudio=stream.getAudioTracks()[0];
  const active=()=>isActive()&&participant.getTrackPublication('screen_share')?.track===video;
  const stopNew=()=>stream.getTracks().forEach(t=>t.stop());
  if(!nextVideo||nextVideo.readyState==='ended'||!active()){stopNew();return {cancelled:true};}
  nextVideo.contentHint='motion';
  // Resize is best effort: browsers may ignore a requested resolution.
  try{await nextVideo.applyConstraints({width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}});}catch{}
  if(!active()){stopNew();return {cancelled:true};}
  try{
    // User-provided keeps the old capture alive until replacement succeeds.
    await video.replaceTrack(nextVideo,{userProvidedTrack:true});
  }catch(error){
    // The SDK may have updated internal listeners before sender.replaceTrack fails.
    if(active()&&oldVideo.readyState!=='ended'){
      try{await video.replaceTrack(oldVideo,{userProvidedTrack:true});}catch{
        await participant.unpublishTrack(video).catch(()=>{});oldVideo.stop();
      }
    }
    stopNew();throw new Error('Não foi possível trocar a tela. Verifique a transmissão e tente novamente.',{cause:error});
  }
  oldVideo.stop();
  if(!active()){stopNew();return {cancelled:true};}
  const audio=participant.getTrackPublication('screen_share_audio')?.track;
  const oldAudio=audio?.mediaStreamTrack;
  let warning;
  try{
    if(nextAudio&&audio){await audio.replaceTrack(nextAudio,{userProvidedTrack:true});oldAudio.stop();}
    else if(nextAudio){await participant.publishTrack(nextAudio,{source:'screen_share_audio'});}
    else if(audio){oldAudio.stop();await participant.unpublishTrack(audio);}
  }catch{
    // Never keep transmitting audio from the previous screen after a switch.
    oldAudio?.stop();nextAudio?.stop();
    if(audio)await participant.unpublishTrack(audio).catch(()=>{});
    warning='Tela trocada, mas o áudio não pôde ser atualizado. Use Trocar tela novamente e marque Compartilhar áudio.';
  }
  if(!active()){stopNew();const lateAudio=participant.getTrackPublication('screen_share_audio')?.track;if(lateAudio?.mediaStreamTrack===nextAudio)await participant.unpublishTrack(lateAudio).catch(()=>{});return {cancelled:true};}
  // Stop any extra tracks a browser might return; only one of each is published.
  for(const t of stream.getTracks())if(t!==nextVideo&&t!==nextAudio)t.stop();
  return {switched:true,warning};
}
