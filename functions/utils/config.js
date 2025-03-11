// Create a utility file for configuration values
const getOwnerEmail = () => {
  return process.env['owner-contact-email'] || 'default@example.com';
};

const getMaxSequenceLimit = () => {
  return 25; // Maximum number of sequences allowed for download
};

module.exports = {
  getOwnerEmail,
  getMaxSequenceLimit
};