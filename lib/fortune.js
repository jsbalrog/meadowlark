var fortuneCookies = [
	'Conquer your fears or they will conquer you.',
	'Rivers need springs',
	'Do not fear what you don\'t know',
	'You will have a pleasant surprise',
	'Keep it simple'
];

module.exports = function() {
	var i = Math.floor(Math.random() * fortuneCookies.length);
	return fortuneCookies[i];
}