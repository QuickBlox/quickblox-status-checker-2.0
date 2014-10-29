Quickblox Status Checker 2.1
============================

3rd iteration of the [status checker](http://status.quickblox.com) we use to monitor the API.

### Getting dependencies

    npm install


### Map

- `server.js` - Runs a server and serves /templates/status.html (and files in ./files). Handles requests, initiated the ‘live test’ and the cron job for routine checking is also inside this file.

- `check.js` - Runs the actual checks. Create a check with `new Check(instance, callback)` where `instance` is an {object} from config.instances, and callback returns the data on completion, passes an object containing `latency`, `errors` and `total`.

- `alerts.js` - Sends an email when some stats failed using AWS SES.

- `config.js` - Should be called `42.js`.


### Running a check

Add an instance to config.testInstance or to config.instances. For the former, start the script with

    node check.js --go-with-test

For the latter, start with 

    node check.js --go

