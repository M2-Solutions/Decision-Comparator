document.getElementById('imageButton').addEventListener('click', function() {
    const apiKey = 'YOUR_UNSPLASH_API_KEY'; // Replace with your Unsplash API key - REMEMBER TO REPLACE THIS WITH YOUR OWN API KEY
    const searchTerm = 'BTMS';
    const imageUrl = `https://source.unsplash.com/random?${searchTerm}`; // Using source.unsplash.com for simplicity

    document.getElementById('randomImage').src = imageUrl;
});