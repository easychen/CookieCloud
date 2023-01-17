<?php
/**
 * This is project's console commands configuration for Robo task runner.
 *
 * @see https://robo.li/
 */
class RoboFile extends \Robo\Tasks
{
    // define public methods as commands
    public function buildDev()
    {
        $this->_exec("cd extension && npx browserslist@latest --update-db && yarn build");
    }
}