package com.yaya.onlyus;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final Uri SITE_URI = Uri.parse("https://yaya-abcd.github.io/You-and-Me/");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, SITE_URI);
            browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(browserIntent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.browser_unavailable, Toast.LENGTH_LONG).show();
        } finally {
            finish();
        }
    }
}
