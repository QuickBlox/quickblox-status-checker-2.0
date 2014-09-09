var ChatUser 	= require("./chat"),
	config		= require("./config"),
	colors		= require("colors"),
	chance		= require("chance").Chance();

var instance 		= "QuickbloxStarter",
	stanzaCredit 	= 0;
	
var onOnline = function() {
	console.log(("Connected with " + config.xmpp[instance].sender.jid).green);
	var room = starter.join(config.xmpp[instance].room.address + "/" + config.xmpp[instance].sender.jid.split("-")[0]);
	setTimeout(function(){
		if(typeof room === "string") {
			var randomMsg = chance.guid();
			starter.send({
				to: room,
				group: true,
				message: randomMsg,
				history: true,
				debug: true
			});
			stanzaCredit++;
			console.log("Sent %s to %s".blue, randomMsg, room);
		}
	}, 250);
};

var onStanza = function(stanza) {
	if(stanzaCredit > 0) {
		stanzaCredit--;
		console.log(stanza.root().toString().yellow);
	}
};

var starter = new ChatUser({credentials: config.clone(config.xmpp[instance].sender), on: { online: onOnline, stanza: onStanza } });


/*
starter.send({
	to: config.xmpp[instance].recipient.jid,
	group: false,
	message: chance.guid(),
	history: true,
	debug: true
});
*/


//console.log("====\nconfig.xmpp[instance].room.address + "/" + config.xmpp[instance].sender.jid.local.split("-")[0]\n====".yellow)

//console.log(config.xmpp[instance].sender.jid);

//console.log(JSON.stringify(config.xmpp[instance], null, 2).cyan);


