<?php
/**
 * This is project's console commands configuration for Robo task runner.
 *
 * @see https://robo.li/
 */
class RoboFile extends \Robo\Tasks
{
    public function apiDev()
    {
        $this->_exec("cd api && node_modules/nodemon/bin/nodemon.js app.js");
    }

    public function api()
    {
        $this->_exec("cd api && API_ROOT=/cookie node app.js");
    }

    public function imagePub($uniqid = null)
    {
        if ($uniqid == null) {
            $uniqid = date("Y.m.d.H.i");
            ;
        }

        $this->_exec("docker buildx create --use --name build-node-example --driver docker-container");
        $this->_exec("docker buildx build -t easychen/cookiecloud:latest -t easychen/cookiecloud:$uniqid --platform=linux/amd64,linux/arm/v7,linux/arm64/v8,linux/ppc64le,linux/s390x --push ./docker");
        $this->_exec("docker buildx rm build-node-example");
   
    }

    public function extBuild()
    {
        $this->_exec("cd extension && pnpm build && pnpm package");
    }

    public function firefoxBuild()
    {
        $this->_exec("cd extension && pnpm build --target=firefox-mv2 && pnpm package --target=firefox-mv2");
    }

    public function firefoxDev()
    {
        $this->_exec("cd extension && pnpm dev --target=firefox-mv2");
    }

    public function extDev()
    {
        $this->_exec("cd extension && pnpm dev");
    }
}