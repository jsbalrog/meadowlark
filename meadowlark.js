var express = require('express');
var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var app = express();
var jqupload = require('jquery-file-upload-middleware');
var credentials = require('./lib/credentials.js');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');
var nodemailer = require('nodemailer');

// set up handlebars view engine
var handlebars = require('express3-handlebars').create({ defaultLayout:'main' });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

// setup domains
app.use(function(req, res, next) {
	// create a domain for this request
	var domain = require('domain').create();
	// handle errors on this domain
	domain.on('error', function(err) {
		console.error('DOMAIN ERROR CAUGHT\n', err.stack);
		try {
			// failsafe shudown in 5 seconds
			setTimeout(function() {
				console.error('Failsafe shutdown.');
				process.exit(1);
			}, 5000);

			// disconnect from the cluster
			var worker = require('cluster').worker;
			if(worker) worker.disconnect();

			// stop taking new requests
			server.close();

			try {
				// attempt to use Express error route
				next(err);
			} catch(err) {
				// if Express error route failed, try
				// plain Node response
				console.error('Express error mechanism failed.\n', err.stack);
				res.statusCode = 500;
				res.setHeader('content-type', 'text/plain');
				res.end('Server error.');
			}
		} catch(err) {
			console.error('Unable to send 500 response.\n', err.stack);
		}
	});

	// add the request and response objects to the domain
	domain.add(req);
	domain.add(res);

	// execute the rest of the rquest chain in the domain
	domain.run(next);
});

// use the 'static' middleware that is provided with express
app.use(express.static(__dirname + '/public'));

// define middleware to conditionally show tests
app.use(function(req, res, next) {
	res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
	next();
});

app.use(function(req, res, next) {
	if(!res.locals.partials) res.locals.partials = {};
	res.locals.partials.weather = getWeatherData();
	next();
});

// to handle POST data
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

// to handle cookies
app.use(cookieParser(credentials.cookieSecret));
// to store session info server-side via cookies
app.use(expressSession({secret: '<mysecret>', 
                 saveUninitialized: true,
                 resave: true}));

// remove any existing flash messages in the session
app.use(function(req, res, next) {
	// if there's a flash message, transfer
	// it to the context, then clear it
	res.locals.flash = req.session.flash;
	delete req.session.flash;
	next();
});

// to handling sending email
var mailTransport = nodemailer.createTransport({
	service: 'Gmail',
	auth: {
		user: credentials.gmail.user,
		pass: credentials.gmail.password
	}
});

// set up logging
switch(app.get('env')) {
		case 'development':
			// compact, colorful dev logging
			app.use(require('morgan')('dev'));
			break;
		case 'production':
			// module 'express-logger' supports daily log rotation
			app.use(require('express-logger')({ path: __dirname + '/log/requests.log'}));
			break;
}

// routes:
app.get('/', function(req, res) {
  res.render('home');
});

app.get('/about', function(req, res) {
  res.render('about', { fortune: fortune() , pageTestScript: '/qa/tests-about.js' });
});

app.get('/newsletter', function(req, res) {
	res.render('newsletter', { csrf: 'CSRF token goes here' });
});

app.post('/newsletter', function(req, res) {
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) {
		if(req.xhr) return res.json({ error: 'Invalid name email address.' });
		req.ression.flash = {
			type: 'danger',
			intro: 'Validation error!',
			message: 'The email address you entered was not valid.',
		};
		return res.redirect(303, '/newsletter/archive');
	}
	new NewsletterSignup({ name: name, email: email }).save(function(err) {
		if(err) {
			if(req.xhr) return res.json({ error: 'Database error.' });
			req.session.flash = {
				type: 'danger',
				intro: 'Database error!',
				message: 'There was a database error; please try again later.'
			}
			res.redirect(303, '/newsletter/archive');
		}
		if(req.xhr) return res.json({ success: true });
		req.session.flash = {
			type: 'success',
			intro: 'Thank you!',
			message: 'You have now been signed up for the newsletter.'
		};
		return res.redirect(303, '/newsletter/archive');
	});
});

app.get('/contest/vacation-photo', function(req, res) {
	var now = new Date();
	res.render('contest/vacation-photo', { year: now.getFullYear(), month: now.getMonth() });
});

app.post('/contest/vacation-photo/:year/:month', function(req, res) {
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files) {
		if(err) return res.redirect(303, '/error');
		console.log('received fields:');
		console.log(fields);
		console.log('received files:');
		console.log(files);
		res.redirect(303, '/thank-you');
	});
});

// jquery file upload
app.get('/contest/funny-photo', function(req, res) {
  res.render('contest/funny-photo');
});

app.use('/upload', function(req, res, next) {
  var now = Date.now();
  jqupload.fileHandler({
    uploadDir: function() {
      return __dirname + '/public/uploads/' + now;
    },
    uploadUrl: function() {
      return '/uploads/' + now;
    }
  })(req, res, next);
});

// shopping cart confirmation email
app.post('/cart/checkout', function(req, res) {
	var cart = req.session.cart;
	if(!cart) next(new Error('Cart does not exist.'));
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
	// assign a random cart ID; normally we would use a database ID here
	cart.number = Math.random().toString().replace(/^0\/0*/, '');
	cart.billing = {
		name: name,
		email: email
	};
	
	res.render('email/cart-thank-you', { layout: null, cart: cart}, function(err, html) {
		if(err) console.log('error in email template');
		mailTransport.sendMail({
			from: '"Meadowlark Travel": info@meadowlarktravel.com',
			to: cart.billing.email,
			subject: 'Thank you for booking your trip!',
			html: html,
			generateTextFromHtml: true
		}, function(err) {
			if(err) console.error('Unable to send confirmation: ' + err.stack);
		});
	});
	res.render('cart-thank-you', { cart: cart });
});

app.get('/fail', function(req, res) {
	throw new Error('Nope!');
});

app.get('/epic-fail', function(req, res) {
	// see http://stackoverflow.com/questions/15349733/setimmediate-vs-nexttick
	setImmediate(function() {
		throw new Error('Kaboom!');
	});
});

// custom 404 page
app.use(function(req, res) {
  res.status(404);
  res.render('404');
});

// custom 500 page
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).render('500');
});

function startServer() {
	require('http').createServer(app).listen(app.get('port'), function() {
		console.log('Express started in ' + app.get('env') +
							 ' mode on http://localhost:' + app.get('port') +
							 '; press Ctrl-C to terminate.');
	});
}

if(require.main === module) {
	// application run directly; start app server
	startServer();
} else {
	// application imported as a module via "require": export function
	// to create server
	module.exports = startServer;
}

function getWeatherData() {
	return {
		locations: [
			{
				name: 'Portland',
				forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
				iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
				weather: 'Overcast',
				temp: '54.1 F (12.3 C)'
			},
			{
				name: 'Bend',
				forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
				iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
				weather: 'Partly Cloudy',
				temp: '55.0 F (12.8 C)'
			},
			{
				name: 'Manzanita',
				forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
				iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
				weather: 'Partly Cloudy',
				temp: '55.0 F (12.8 C)'
			}
		]
	};
}
