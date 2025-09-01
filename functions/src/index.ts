import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

export const createUserProfile = functions.auth.user().onCreate(async (user) => {
  const userProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    subscription: {
      plan: "free",
      status: "active",
      startDate: admin.firestore.FieldValue.serverTimestamp(),
    },
    usage: {
      videosGenerated: 0,
      storageUsed: 0,
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
    },
  };

  try {
    await admin.firestore().collection("users").doc(user.uid).set(userProfile);
    functions.logger.info(`User profile created for ${user.uid}`);
  } catch (error) {
    functions.logger.error("Error creating user profile:", error);
  }
});

export const deleteUserData = functions.auth.user().onDelete(async (user) => {
  const batch = admin.firestore().batch();
  
  try {
    const userDoc = admin.firestore().collection("users").doc(user.uid);
    batch.delete(userDoc);

    const projectsSnapshot = await admin.firestore()
      .collection("projects")
      .where("userId", "==", user.uid)
      .get();

    projectsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    const videosSnapshot = await admin.firestore()
      .collection("videos")
      .where("userId", "==", user.uid)
      .get();

    videosSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    functions.logger.info(`User data deleted for ${user.uid}`);
  } catch (error) {
    functions.logger.error("Error deleting user data:", error);
  }
});