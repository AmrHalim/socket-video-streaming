// Video element
var video = document.getElementById('video'),
   // Signaling server url
   socket_server_url = 'https://18.217.214.110:9999/',
   // Peer connection configurations
   // Stun and Turn servers
   peerConnectionCofigurations = {
      'iceServers': [
         {url:'stun:stun01.sipphone.com'},
         {url:'stun:stun.ekiga.net'},
         {url:'stun:stun.fwdnet.net'},
         {url:'stun:stun.ideasip.com'},
         {url:'stun:stun.iptel.org'},
         {url:'stun:stun.rixtelecom.se'},
         {url:'stun:stun.schlund.de'},
         {url:'stun:stun.l.google.com:19302'},
         {url:'stun:stun1.l.google.com:19302'},
         {url:'stun:stun2.l.google.com:19302'},
         {url:'stun:stun3.l.google.com:19302'},
         {url:'stun:stun4.l.google.com:19302'},
         {url:'stun:stunserver.org'},
         {url:'stun:stun.softjoys.com'},
         {url:'stun:stun.voiparound.com'},
         {url:'stun:stun.voipbuster.com'},
         {url:'stun:stun.voipstunt.com'},
         {url:'stun:stun.voxgratia.org'},
         {url:'stun:stun.xten.com'},
         {
            url: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
         },
         {
            url: 'turn:192.158.29.39:3478?transport=udp',
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808'
         },
         {
            url: 'turn:192.158.29.39:3478?transport=tcp',
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808'
         }
  ]};

// Global variables
var socket, 
   other,
   otherCandidates,
   myStream,
   otherStream,
   pc,
   owner,
   uuid,
   callee,
   peers,
   calltry;

// Initialization method
// Call on document load and everytime a stream ends
function init(){
   logger('init called')
   other = false;
   otherCandidates = [];
   myStream = false;
   otherStream = false;
   owner = false;
   uuid = null;
   callee = false;
   peers = {};
   calltry = false;
}

// Helper functions
// Create a new peer connection
function createPeerConnection(){
   var peerconnection = new RTCPeerConnection(peerConnectionCofigurations);
   // Add onicecandidate event listener to send any created icecandidate for this peerconnection
   peerconnection.onicecandidate = function (candidate){
      logger('onicecandidate called');
      socket.emit('icecandidate', {icecandidate: candidate.candidate, uuid: uuid});
   };
   // Add onaddstream event listener to show the coming stream to the watching users
   peerconnection.onaddstream = function (e){
      logger('onaddstream called');
      otherStream = e.stream;
      video.src = URL.createObjectURL(otherStream);
   };
   return peerconnection;
}
// Connect to signaling socket server
function socket_connect(socket_url){
    socket = io.connect(socket_url);
    return socket;
}
// Log anything on the console for debugging
function logger(_log){
   console.log(_log);
}
// Show a message to the user
function show_message(_message, _error){
   $("#message").html(_message);
   if (_error){
      $("#message").removeClass('info').addClass('error');
   } else {
      $("#message").removeClass('error').addClass('info');  
   }
}
// Remove message
function clear_message(){
   $("#message").empty();
}
// Show buttons
function show_buttons(){
   $("#receive").removeAttr('disabled');
   $("#call").removeAttr('disabled');
}
// Hide buttons
function hide_buttons(){
   $("#receive").attr('disabled', 'disabled');
   $("#call").attr('disabled', 'disabled');
}

// Document is ready
$(document).ready(function(){
   // Initialize client objects
   init();
   // Connect to signaling server
   socket_connect(socket_server_url);

   // Define sockets handling
   // Once a connection gets created, assign user unique id UUID
   socket.on('uuid' , function(_uuid){
      uuid = _uuid;
   });

   // When a user tries to broadcast, he has one of two options:
   // There are no streams at the moment, so he can start his broadcast now.
   socket.on('call', function(){
      clear_message();
      // Get user stream.
      navigator.getMedia =    navigator.getUserMedia ||
                        navigator.webkitGetUserMedia;

      navigator.getMedia({
         video: true,
         audio: true
      }, function(stream){
         myStream = stream;
         owner = true;
         // Emit to the other users that a new stream just started.
         socket.emit('stream', uuid);
         // Show the broadcast to the owner.
         video.src = URL.createObjectURL(myStream);
         // Disable call and receive buttons.
         hide_buttons();
      }, function(err){
         logger(err);
      });
   });

   // There is a stream at the moment, so he can't start his broadcast now.
   socket.on('cantcall', function (){
      // Mark this user as a call trier
      calltry = true;
      // Show a message to the user that he can't broadcast now
      clear_message();
      show_message("You can't broadcast your video at the moment because there's another stream.<br>Press Watch to see it.", true)
   });

   // When a user tries to watch a stream, he has one of two options:
   // There is a stream now, so he can watch it
   socket.on('canreceive', function(){
      clear_message();
      // Mark this user as a callee, so he can now receive a broadcast
      callee = true;
       // Create an offer from the watcher to the broadcast owner
      var mediaConstraints = {
         optional: [],
         mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true
         }
      };
      // Create a new peer connection
      pc = createPeerConnection();
      // Create an offer to connect to the streaming client
      pc.createOffer(function(offer){
         pc.setLocalDescription(offer, function(){
            // Tell the broadcaster client that there's a user who's trying to connect
            socket.emit('offer', {uuid: uuid, offer: offer});
         });
      }, function(err){
         logger(err);
      }, mediaConstraints);
   });

   // There are no streams at the moment, so he can't watch anything
   socket.on('cantreceive', function(){
      // We have to make sure that the requesting user is neither the broadcast owner any of the watchers.
      if (!owner && !callee) show_message("There are no streams right now to watch.<br>Press Broadcast if you want to start your own stream.", true);
   });

   // When the owner/broadcaster of the current stream leaves.
   socket.on('owner_left', function(){
      // If the user is already in the conversation or tried to watch when there was no streams
      if (callee || calltry){
         // Tell the users with the above criteria that the current stream is over and they can start their stream now.
         clear_message();
         show_message('Stream has just ended.<br>Press Broadcast if you want to start your own stream now.', true);
         // Enable both the broadcast and watch buttons again
         show_buttons();
         video.src = '';
      } else {
         // Otherwise, just clear any errors.
         clear_message();
      }
      // Retrive the state of this client to the initial state.
      init();
   });

   // When any user except the stream owner leaves the conversation
   socket.on('leave', function(leave_id){
      logger('leave called')
      // Close the peer connection between the owner and this leaving user.
      if (peers[leave_id]) peers[leave_id].close();
   });

   // When a new stream gets created
   socket.on('newstream', function(){
      // Tell everybody connected to the signaling server except the owner that a new stream has just begun.
      if (!owner) show_message('There is a new stream now.<br>Press Watch to see it.', false);
   });

   // When the owner receives an offer to connect to a new watcher
   socket.on('offer', function(data){
      if (owner){
         logger('Offer called');
         // Create a new peer connection to this user
         peers[data.uuid] = createPeerConnection();
         other = true;
         // Create a session description of the offer
         var rtcDesc = new RTCSessionDescription(data.offer);
         // Set the remote description to new created connection to this session description
         peers[data.uuid].setRemoteDescription(rtcDesc);
         // Add the current stream to this connection
         peers[data.uuid].addStream(myStream);
         // Create an answer to this offer
         peers[data.uuid].createAnswer(function(answer){
            // Set the local description of new created
            peers[data.uuid].setLocalDescription(answer);
            // Add icecandidates to this connection Interactive Connectivity Establishment
            for (var i = 0; i < otherCandidates.length; i++) {
                if (otherCandidates[i].candidate) {
                    peers[data.uuid].addIceCandidate(new RTCIceCandidate(otherCandidates[i].candidate));
                }
            }
            // Send this answer to the owner of the stream.
            // Make sure to send the socketid of the signaling server to send this answer explicitly to the offerer client
            socket.emit('answer', {answer: answer, uuid: data.uuid, socketid: data.socketid});
         }, function(err){
            logger(err);
         });
      }
   });

   // When the receiver gets back an answer from the broadcaster to his offer
   socket.on('answer', function(data){
      // Make sure the this is not the owner and that this is an already caller with a uuid of the same once sent from the answer
      if (!owner && callee && data.uuid == uuid){
         other = true;
         // Set the remote description of this client's peer connection to the one sent from the offer
         pc.setRemoteDescription(new RTCSessionDescription(data.answer), function(){
            logger('Connection Established');
            // The connection is successfully established between both clients
            // Disable both broadcast and watch buttons
            hide_buttons();
            // Add all already created icecandidates to this peer connection
            for (var i = 0; i < otherCandidates.length; i++) {
                  if (otherCandidates[i] && otherCandidates[i].candidate) {
                     pc.addIceCandidate(new RTCIceCandidate(otherCandidates[i]));
                  }
              }
         }, function(err){
            logger(err);
         })
      }
   });

   // When any peer connection, offer or answer gets created, a new icecandidate gets fired,
   socket.on('icecandidate', function(data){
      // If the current user doesn't have any hand of this created icecandidate, just add it to otherCandidates array
      // to be added later
      if (!other){
         otherCandidates.push(data.icecandidate);
      }

      if (other && data.icecandidate && data.icecandidate.candidate && data.icecandidate.candidate !== null){
         // If this is the owner of the stream then this icecandidate is created by an answer.
         // Add this ice candidate to the corresponding peer connection using the sent uuid
         if (owner && peers[data.uuid]){
            logger('icecandidate created')
            peers[data.uuid].addIceCandidate(new RTCIceCandidate(data.icecandidate));
         } else if (pc) {
            // Otherwise, add this icecandidate to the peer connection of the client
            logger('icecandidate created')
            pc.addIceCandidate(new RTCIceCandidate(data.icecandidate));
         }
      }
   });

   // When the user clicks on the Broadcast button, try to make a call
   $("#call").click(function(){
      socket.emit('trycall', uuid);
   });

   // When the user clicks on the Watch button, try to receive a call
   $("#receive").click(function(){
      socket.emit('tryreceive');
   });
});
