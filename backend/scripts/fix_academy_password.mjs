/**
 * One-off script: Reset academy user password to "password" (bcrypt hashed)
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('No MONGODB_URI'); process.exit(1); }

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB');

const db = mongoose.connection.db;
const playersCol = db.collection('players');

// Step 1: Find all academy-role users
const academyUsers = await playersCol.find({ "data.role": "academy" }).toArray();
console.log(`\n🔍 Found ${academyUsers.length} academy user(s):`);
academyUsers.forEach(u => {
  console.log(`  - ID: ${u.id}, Name: ${u.data?.name}, Email: ${u.data?.email}, HasPassword: ${!!u.data?.password}`);
});

if (academyUsers.length === 0) {
  // Broader search - maybe the role is different
  console.log('\n🔍 No "academy" role found. Searching for non-standard roles...');
  const allRoles = await playersCol.aggregate([
    { $group: { _id: "$data.role", count: { $sum: 1 } } }
  ]).toArray();
  console.log('All roles in DB:', allRoles);
  
  // Also search by name/email pattern
  const possibleAcademy = await playersCol.find({
    $or: [
      { "data.role": { $regex: /academy|coach|org/i } },
      { "data.name": { $regex: /academy/i } },
      { "data.email": { $regex: /academy/i } }
    ]
  }).toArray();
  console.log(`\n🔍 Broader search found ${possibleAcademy.length} result(s):`);
  possibleAcademy.forEach(u => {
    console.log(`  - ID: ${u.id}, Name: ${u.data?.name}, Role: ${u.data?.role}, Email: ${u.data?.email}, HasPassword: ${!!u.data?.password}`);
  });
}

// Step 2: Hash "password" and update all academy users
const hashedPassword = await bcrypt.hash('password', 10);
console.log(`\n🔐 New bcrypt hash generated for "password"`);

for (const user of academyUsers) {
  const result = await playersCol.updateOne(
    { id: user.id },
    { $set: { "data.password": hashedPassword, lastUpdated: new Date() } }
  );
  console.log(`✅ Updated ${user.id} (${user.data?.name}): modified=${result.modifiedCount}`);
}

await mongoose.disconnect();
console.log('\n✅ Done. Academy user(s) can now login with password: "password"');
