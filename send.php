<?php

$to = "albert.han@tts.edu.sg";   // <-- CHANGE THIS TO YOUR EMAIL
$subject = "New Contact Form Message";

$name = htmlspecialchars($_POST["name"]);
$email = htmlspecialchars($_POST["email"]);
$message = htmlspecialchars($_POST["message"]);

$body = "Name: $name\n";
$body .= "Email: $email\n\n";
$body .= "Message:\n$message";

$headers = "From: $email";

if (mail($to, $subject, $body, $headers)) {
    echo "Message sent successfully.";
} else {
    echo "Error sending message.";
}

?>