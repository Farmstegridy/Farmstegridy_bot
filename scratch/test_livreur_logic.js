const userInfo = {
  "is_livreur": true,
  "isLivreur": true,
  "isAdmin": false
};

if (!userInfo.isLivreur && !userInfo.isAdmin) {
    console.log("ACCES REFUSE");
} else {
    console.log("ACCES AUTORISE");
}
