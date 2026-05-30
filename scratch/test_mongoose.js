const mongoose = require('mongoose');

async function test() {
  const PlayerDataSchema = new mongoose.Schema({
    email: String,
    role: String
  }, { _id: false, strict: false });
  
  const PlayerSchema = new mongoose.Schema({
    id: String,
    data: PlayerDataSchema
  }, { minimize: false, strict: false });
  
  const Player = mongoose.model('TestPlayer', PlayerSchema);
  
  const doc = new Player({ id: '1', data: { email: 'a@a.com', role: 'admin' } });
  
  // modify undocumented field
  doc.data.supportStatus = 'suspended';
  doc.markModified('data');
  
  console.log("Before save (toJSON):", doc.toJSON());
  console.log("Before save (toObject):", doc.toObject());
}
test();
