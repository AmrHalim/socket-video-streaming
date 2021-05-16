// Require some npm modules and defining some required variables
var fs = require('fs'),
    Uuid = require('uuid'),
    path = require('path'),
    express = require('express'),
    https = require('https'),
    app = express(),
    server,
    config = require('./config'), // Configuration file
    users_connected = 0, // Keep track of currently connected users
    owner_id = null,  // Define current stream owner socket it
    peers = [];

app.use('/', express.static(path.join(__dirname, config.public_directory)));

// SSH certificate configurations
var options = {
    key: fs.readFileSync(path.join(__dirname, config.privatekey_file)),
    cert: fs.readFileSync(path.join(__dirname, config.certificate_file)),
    // ca: fs.readFileSync(path.join(__dirname, config.certrequest_file)),
    passphrase: '1234'
};

// Create an HTTPs server
server = https.createServer(options, app);

// Create a Socket.IO object
var io = require('socket.io').listen(server);

// New user connected to the server
io.on('connection', function(socket){
    console.log('User Connected');
    users_connected++
    console.log('Connected users: ' + users_connected);

    // Create a unique user id for this user
    uuid = Uuid.v1();
    // Assign this uuid as userid to this user connection
    socket.userid = uuid;
    // Send this uuid to the client side of the connected user to identify the upcoming requests
    socket.emit('uuid', uuid);

    // A user tries to receive a stream
    socket.on('tryreceive', function(){
        // Make sure that the trier id is not already in the stream
        if (socket.id !== owner_id && peers.indexOf(socket.id) < 0){
            // Check whether there's a current stream or not
            if (owner_id){
                // Yse? Tell the trier that he can receive now
                socket.emit('canreceive');
            } else {
                // No? Tell the trier that he can't receive now
                socket.emit('cantreceive');
            }
        }
    });

    // A user tries to broadcast a stream
    socket.on('trycall', function(uuid){
        // Make sure that the trier id is not already in the stream
        if (socket.id !== owner_id && peers.indexOf(socket.id) < 0){
            // Check whether there's a current stream or not
            if (owner_id){
                // Yes? Tell the trier that he can broadcast now
                socket.emit('cantcall');
            } else {
                // No? Tell the trier that he can't broadcast now
                socket.emit('call');
            }
        }
    });

    // A stream has been just created
    socket.on('stream', function(uuid){
        // Assign the id of this connection to the owner_id to rise a current broadcasting
        owner_id = socket.id;
        // Tell all the other connected users to this server that a new stream has just begun
        io.sockets.emit('newstream');
    });

    // A watcher is offering a connection
    socket.on('offer', function(data){
        // Add this watcher's connection socket id to the offer to explicitly send the answer back to him
        data.socketid = socket.id;
        // Tell the owner that there's a new offer
        socket.to(owner_id).emit('offer', data);
    });

    // The owner accepted the offer and sent the answer
    socket.on('answer', function(data){
        // Add this user to the list of peers
        peers.push(data.socketid);
        // Send the answer back to the offerer with his socketid
        socket.to(data.socketid).emit('answer', data);
    });

    // A new icecandidate has been added
    socket.on('icecandidate', function(icecandidate){
        // Tell all users connected to this server
        io.sockets.emit('icecandidate', icecandidate);
    });

    // A user disconnected
    socket.on('disconnect', function(e){
        // Check if this user is the owner of the current stream
        if (socket.id == owner_id){
            // Yes? set owner_id to null to mark that there's no current stream
            owner_id = null;
            // Reset the peers array to be empty again
            peers = [];
            // Tell all users connected to this server that the owner left and the stream is over now
            io.sockets.emit('owner_left');
        } else {
            // Remove this user from the list of peers
            delete peers[socket.id];
            // No? Tell the owner of current stream that one user left to clear some objects
            socket.to(owner_id).emit('leave', socket.userid);
        }
        users_connected--;
        console.log('User Disconnected');

        console.log('Connected users: ' + users_connected);
    });
});

server.listen(config.port);
