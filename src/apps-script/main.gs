function PRESS_RUN(){
  return main();
}

// IMPORTANT!!! **Change the required parameters below**

// Target channel handle. Set it to "MYCHANNEL" to scan your own channel.
const CHANNEL_HANDLE="MYCHANNEL";
// Maximum number of latest comments from a specific video to scan
const MAX_NUMBER_OF_LATEST_COMMENTS=5000;
// Skip replies (scanning replies are not implemented yet)
const SKIP_REPLIES=true;
// Skip comments by CHANNEL_HANDLE above (if CHANNEL_HANDLE is your channel, then this skips scanning comments by yourself)
const SKIP_OWNER_COMMENTS=true;
// Enable taking actions against detected comments. Taking action for 50 comments or less costs you 50 units of API quota. Make sure you are either the channel moderator or channel owner before enabling!
const ENABLE_TAKING_ACTIONS=true;
// Regular Expression to detect. Using https://gist.github.com/explor4268/bdbd4012cb408ea89ec6b3f5cfde38be
const FLAGGED_REGEXP=/(?!\p{space})([\u{1D400}-\u{1D7FF}\u{1F130}-\u{1F169}\u{1F170}-\u{1F189}\u2780-\u2793\uFF00-\uFFEF]|d[e3]p[0o]|t[o0]g[3e]l|t[o0]t[0o]|77|88|138)/iu;
// Customize the detection behavior below. **Only change if you know what you're doing.** Should return true if the comment is detected and should be deleted, otherwise return false.
function detectComment(str){
  return FLAGGED_REGEXP.test(str);
}

// **DO NOT CHANGE ANYTHING BELOW UNLESS YOU KNOW WHAT YOU'RE DOING**

var usedApiQuotaUnits=0;

function getChannelIdFromHandle(channelHandle){
  let results=null;
  if(CHANNEL_HANDLE==="MYCHANNEL")results=YouTube.Channels.list('contentDetails',{mine:true});
  else results=YouTube.Channels.list('contentDetails',{forHandle:channelHandle});
  usedApiQuotaUnits++;
  if(!results||!(results?.items?.length)){
    console.error("Channel not found.")
    return null;
  }
  return results.items[0].id;
}

let logText="";
function appendDetectedSpamLog(str,end=false){
  logText+=str;
  if(end || logText.length>1024){
    console.log("Spam detected! (DO NOT TRUST THESE COMMENTS UNLESS IT IS A FALSE POSITIVE)\n"+logText+"Please take actions to that comment.");
    logText="";
  }
}

function scanForComments(channelId,numOfComments=20){
  let detectedComments=[];
  const maxResults=numOfComments>=100?100:numOfComments;
  let nextPageToken=null;
  let scanCount=0;
  iterate:do{
    const commentsResponse=YouTube.CommentThreads.list('id,snippet,replies',{
      allThreadsRelatedToChannelId:channelId,
      order:'time',
      textFormat:'plainText',
      maxResults:maxResults,
      pageToken:nextPageToken
    });
    usedApiQuotaUnits++;
    if(!commentsResponse||!(commentsResponse?.items?.length)){
      break;
    }
    for(let comment of commentsResponse.items){
      scanCount++;
      // console.log(comment.snippet.topLevelComment.snippet.textOriginal);
      // console.log(comment.snippet.topLevelComment.snippet.authorChannelId.value,channelId);
      if((!(SKIP_OWNER_COMMENTS && comment.snippet.topLevelComment.snippet.authorChannelId.value===channelId)) && detectComment(comment.snippet.topLevelComment.snippet.textOriginal)){
        let detectedEntry={
          commentId:comment.id,
          directLink:`https://www.youtube.com/watch?v=${comment.snippet.videoId}&lc=${comment.id}`,
          text:comment.snippet.topLevelComment.snippet.textOriginal
        }
        appendDetectedSpamLog(`Direct link: ${detectedEntry.directLink}
Content: ${detectedEntry.text}
`)
        detectedComments.push(detectedEntry);
      }
      if(scanCount>=numOfComments){
        appendDetectedSpamLog("",true);
        console.log("Scan completed for %s (%s)",CHANNEL_HANDLE,channelId);
        break iterate;
      }
    }
    console.log("Scanned %s of maximum %s with maxResults of %s",scanCount,numOfComments,maxResults)
    nextPageToken=commentsResponse.nextPageToken;
  }while(nextPageToken);
  appendDetectedSpamLog("",true);
  return detectedComments;
}

function deleteComments(detectedComments){
  console.warn(`This process takes up roughly ${Math.ceil(detectedComments.length/50)*50} API quota units.`);
  if(ENABLE_TAKING_ACTIONS){
    const totalDetectedComments=detectedComments.length;
    let totalDeleted=0;
    let prevUsedApiQuotaUnits=usedApiQuotaUnits;
    do{
      const commentIds=detectedComments.splice(0,50).map(entry=>entry.commentId);
      if(commentIds.length===0)break;
      totalDeleted+=commentIds.length;
      console.log("Deleting %s of %s comments (%s remaining)",totalDeleted,totalDetectedComments,detectedComments.length);
      YouTube.Comments.setModerationStatus(commentIds,"rejected");
      // console.log(commentIds,"rejected");
      usedApiQuotaUnits+=50;
      if(usedApiQuotaUnits>9800){
        console.error("%s API quota units have been used for this run. Please try again tomorrow or you may get an error.",usedApiQuotaUnits);
        break;
      }
      if(usedApiQuotaUnits-prevUsedApiQuotaUnits>3000){
        console.warn("%s API quota units have been used so far. Process will be stopped when approaching near the 10000 API quota units limit. If that happens, please try again tomorrow.",usedApiQuotaUnits);
        prevUsedApiQuotaUnits=usedApiQuotaUnits;
      }
    }while(detectedComments.length>0)
    console.info("Comments deleted successfully");
  }else{
    console.error('To continue taking actions, please read the warnings above and make sure you are either the channel moderator or channel owner and set ENABLE_TAKING_ACTIONS parameter to true.');
  }
}

function main() {
  console.warn("Scanning replies are not implemented yet.")
  console.info("Getting channel ID from channel handle...");
  const channelId=getChannelIdFromHandle(CHANNEL_HANDLE);
  if(channelId===null)return;
  console.info("Channel ID of %s is %s. Scanning maximum of %s comments",CHANNEL_HANDLE,channelId,MAX_NUMBER_OF_LATEST_COMMENTS);
  let detectedComments=scanForComments(channelId,MAX_NUMBER_OF_LATEST_COMMENTS);
  console.info("About %s API quota units used by far for this run. Maximum of 10000 API quota units can be used each day.",usedApiQuotaUnits);
  console.info("%s comments needs to be deleted. Deleting automatically requires you to be either as the channel moderator or the channel owner.",detectedComments.length);
  deleteComments(detectedComments);
  console.info("About %s API quota units used for this entire run. Maximum of 10000 API quota units can be used each day.",usedApiQuotaUnits);
}
