module.exports = {
    // Username and password that can be used for most checks. A login that won't change.
    masterLogin: {
        login: "{username here}",
        password: "{password here}"
    },
    global_timeout: 20000, // Timeout for HTTP
    chat_timeout: 20000, // Timeout for XMPP messages
    testingTable: "TestingClassNode", // CO Class for CO testing
    testInstance: [], // Add an instance here and run 'node check.js --go-with-test' to use this
    instances: [
    {
        name: "{name of instance here}", // Not super relevant in just check.js context, is when you're running server.js
        app_id: 66000,
        auth_key: "",
        auth_secret: "",
        endpoint: "", // "api.quickblox.com",
        chat_v2: true,
        email_alerts: [], // Array of email addresses to send alerts to. Probably not useful.
        xmpp: {
            recipient: {
	            jid: "", // "XXXX_XXXX@chat.quickblox.com",
		        password: "",
		        host: "" // "chat.quickblox.com"
	        },
	        sender: {
		        jid: "", // "XXXX_XXXX@chat.quickblox.com",
		        password: "",
		        host: "" // "chat.quickblox.com"
		    }
        }
    }
    ]
}