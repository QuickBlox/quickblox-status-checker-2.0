module.exports = {
	instances: [{ // array of instances to check
		name: "MyQuickbloxInstance", // use the same name throughout
		app_id: 0,
		auth_key: "",
		auth_secret: "",
		endpoint: "api.quickblox.com", // define endpoint for each instance
		//chat_v2: true
		//chat_enabled: false
	}],
	masterLogin: { // login for use in stats after user.delete and other misc stuff
		login: "",
		password: ""
	},
	status_app: {
		// credentials of app to upload data to
		// data is stored in custom objects btw
		app_id: 0,
		auth_key: "",
		auth_secret: "",
		endpoint: "api.quickblox.com"
	},
	xmpp: { // Object containing all of the XMPP credentials to check the chat with.
			// There must be one XMPP credentials set for each instance, with a name
			// corresponding to the instances.name above
	    MyQuickbloxInstance: {
	        recipient: { // Hander for receiving messages
		        jid: "****-****@chat.quickblox.com", // Username: XMPPReceiver
	            password: "",
	            host: "chat.quickblox.com",
	        },
	        sender: { // Sends the XMPP messages to the receipient above
		        jid: "****-****@chat.quickblox.com", // Username: XMPPSender
	            password: "",
	            host: "chat.quickblox.com"
	        }
	    }
	},
	chat_timeout: 20000, // timeout for chat functions before they quit and move on with their lives
	clone: function(object) {
		return JSON.parse(JSON.stringify(object)); // because... arguments... ahhh 
	}
}